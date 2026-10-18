import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Link2, Lock, LockOpen, ShoppingCart, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { cargarXLSX } from '@/lib/cargarLibrerias'
import { cn } from '@/lib/utils'
import {
  BODEGAS,
  cambiarEstadoPlan,
  desvincularOcPlan,
  fmtPesos,
  listarLineasPlan,
  listarOcCandidatas,
  listarOcPlan,
  listarSolicitudesPlan,
  obtenerPlan,
  vincularOcPlan,
  type LineaPlan,
  type OcCandidata,
  type PlanCompra,
  type Solicitud,
} from '../lib/api'
import { ESTADO } from '../lib/catalogos'
import { RUTA } from '../lib/rutas'
import { usePermisosAdq } from '../hooks/usePermisosAdq'
import type { Prellenado } from './NuevaSolicitud'
import { nombrePlan } from './Planes'

// Seguimiento de un plan de compra: lo planificado por material contra lo pedido en solicitudes del plan,
// lo comprado en sus OC de SAP (asociadas a mano o vinculadas a esas solicitudes) y lo recibido.

const num = (n: number | null | undefined, dec = 2) =>
  n == null ? '—' : new Intl.NumberFormat('es-CL', { maximumFractionDigits: dec }).format(n)
const fecha = (s: string | null) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString('es-CL') : '—')

const ESTADO_LINEA: Record<LineaPlan['estado_linea'], { label: string; variant: 'success' | 'default' | 'warning' | 'secondary' }> = {
  recibido: { label: 'Recibido', variant: 'success' },
  comprado: { label: 'Comprado', variant: 'default' },
  parcial: { label: 'Compra parcial', variant: 'warning' },
  en_solicitud: { label: 'En solicitud', variant: 'default' },
  pendiente: { label: 'Sin OC', variant: 'secondary' },
}

export default function Plan() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { comprasEn } = usePermisosAdq()
  const [plan, setPlan] = useState<PlanCompra | null>(null)
  const [lineas, setLineas] = useState<LineaPlan[]>([])
  const [ocs, setOcs] = useState<{ docnum: number; created_at: string }[]>([])
  const [candidatas, setCandidatas] = useState<OcCandidata[]>([])
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [docnums, setDocnums] = useState('')

  const cargar = useCallback(async () => {
    try {
      const [p, l, o, c, s] = await Promise.all([obtenerPlan(id), listarLineasPlan(id), listarOcPlan(id), listarOcCandidatas(id), listarSolicitudesPlan(id)])
      setPlan(p)
      setLineas(l)
      setOcs(o)
      setCandidatas(c)
      setSolicitudes(s)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function hacer(accion: () => Promise<unknown>, exito: string) {
    setOcupado(true)
    try {
      await accion()
      toast.success(exito)
      await cargar()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo completar la acción')
      return false
    } finally {
      setOcupado(false)
    }
  }

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />
  if (!plan)
    return (
      <div className="space-y-3">
        <Link to={RUTA.planes} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a planes
        </Link>
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">El plan no existe o no tienes acceso.</p>
      </div>
    )

  const esCompras = comprasEn(plan.sucursal)
  const abierto = plan.estado === 'abierto'
  // Lo que aún falta pedir: planificado − comprado − lo que ya está en solicitudes abiertas del plan
  const porPedir = lineas
    .map((l) => ({ l, cantidad: Math.max(l.sin_oc - Math.max(l.en_solicitud_plan - l.comprado, 0), 0) }))
    .filter((x) => x.cantidad > 0)

  function crearSolicitud() {
    if (!plan) return
    if (plan.solicitudes_abiertas > 0 && !window.confirm(`Este plan ya tiene ${plan.solicitudes_abiertas} solicitudes abiertas. ¿Crear otra con lo que falta pedir?`)) return
    const hoy = new Date().toISOString().slice(0, 10)
    const estado: Prellenado = {
      datos: {
        plan_id: plan.id,
        sucursal: plan.sucursal,
        area: 'Abastecimiento',
        titulo: `Plan de compra N° ${plan.numero} · ${nombrePlan(plan)}`,
        lugar_entrega: BODEGAS[plan.bodega_codigo],
        justificacion: `Materiales del plan de compra N° ${plan.numero}${plan.nota ? ` (${plan.nota})` : ''}.`,
        fecha_requerida: plan.fecha_necesidad && plan.fecha_necesidad >= hoy ? plan.fecha_necesidad : null,
      },
      items: porPedir.map(({ l, cantidad }) => ({
        articulo_codigo: l.articulo_codigo,
        descripcion: l.articulo_nombre ?? l.articulo_codigo,
        cantidad: Math.ceil(cantidad * 10000) / 10000,
        unidad: l.unidad || 'UN',
        precio_estimado: l.precio_ref != null ? Math.round(l.precio_ref) : null,
      })),
    }
    navigate(RUTA.nueva, { state: estado })
  }

  function vincular(lista: number[]) {
    if (lista.length === 0) return toast.error('Escribe uno o más N° de OC de SAP')
    hacer(() => vincularOcPlan(plan!.id, lista), lista.length === 1 ? 'OC asociada' : 'OC asociadas').then((ok) => ok && setDocnums(''))
  }

  async function exportar() {
    const XLSX = await cargarXLSX()
    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.json_to_sheet(
        lineas.map((l) => ({
          Código: l.articulo_codigo,
          Material: l.articulo_nombre ?? '',
          Unidad: l.unidad ?? '',
          Requerimiento: l.requerimiento,
          'Disponible real': l.disponible_real,
          'OC pendiente al planificar': l.oc_pendiente,
          Sugerido: l.sugerido,
          Planificado: l.planificado,
          'En solicitudes del plan': l.en_solicitud_plan,
          Comprado: l.comprado,
          Recibido: l.recibido,
          'Por recibir': l.por_recibir,
          'Sin OC': l.sin_oc,
          OC: l.docnums ?? '',
          Estado: ESTADO_LINEA[l.estado_linea].label,
          'Precio ref.': l.precio_ref ?? '',
          'Proveedor ref.': l.proveedor_ref ?? '',
        })),
      ),
      'Seguimiento',
    )
    XLSX.writeFile(libro, `Plan_${plan!.numero}_${plan!.periodo}_V${plan!.version}.xlsx`)
  }

  return (
    <div className="space-y-4">
      <Link to={RUTA.planes} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a planes
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono-tabular text-xs text-muted-foreground">Plan de compra N° {plan.numero}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold">{nombrePlan(plan)}</h1>
            <Badge variant={abierto ? 'default' : 'secondary'}>{abierto ? 'Abierto' : 'Cerrado'}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {BODEGAS[plan.bodega_codigo]} · {new Date(plan.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })} · {plan.creado_por_nombre ?? '—'}
            {plan.fecha_necesidad && ` · se necesita el ${fecha(plan.fecha_necesidad)}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {plan.obras == null ? 'Todas las obras abiertas' : `${plan.obras.length} obras`}
            {plan.ot_desde && ` · órdenes desde ${fecha(plan.ot_desde)}`}
            {plan.simulacion.length > 0 && ` · simulación: ${plan.simulacion.map((s) => `${s.cantidad} × ${s.proyecto_nombre ?? s.proyecto_codigo}`).join(', ')}`}
            {plan.nota && ` · ${plan.nota}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportar}>
            <Download className="mr-1 h-4 w-4" /> Excel
          </Button>
          {esCompras && (
            <Button
              size="sm"
              variant="outline"
              disabled={ocupado}
              onClick={() => hacer(() => cambiarEstadoPlan(plan.id, abierto ? 'cerrado' : 'abierto'), abierto ? 'Plan cerrado' : 'Plan reabierto')}
            >
              {abierto ? <Lock className="mr-1 h-4 w-4" /> : <LockOpen className="mr-1 h-4 w-4" />}
              {abierto ? 'Cerrar plan' : 'Reabrir'}
            </Button>
          )}
          {esCompras && abierto && (
            <Button size="sm" disabled={porPedir.length === 0} onClick={crearSolicitud}>
              <ShoppingCart className="mr-1 h-4 w-4" /> Crear solicitud ({porPedir.length})
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Materiales', String(plan.lineas)],
          ['Valor de referencia', fmtPesos(plan.valor_planificado)],
          ['Avance en OC', `${plan.avance_pct}%`],
          ['OC asociadas', String(plan.oc)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border bg-card px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</p>
            <p className="font-mono-tabular text-lg font-bold">{v}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full min-w-[1050px] text-sm">
          <thead>
            <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Material</th>
              <th className="px-2 py-2 text-right font-semibold">Planificado</th>
              <th className="px-2 py-2 text-right font-semibold">En solicitud</th>
              <th className="px-2 py-2 text-right font-semibold">Comprado</th>
              <th className="px-2 py-2 text-right font-semibold">Recibido</th>
              <th className="px-2 py-2 text-right font-semibold">Por recibir</th>
              <th className="px-2 py-2 text-right font-semibold">Sin OC</th>
              <th className="px-2 py-2 font-semibold">OC</th>
              <th className="px-2 py-2 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.articulo_codigo} className="border-b align-top last:border-0">
                <td className="px-3 py-1.5">
                  <p className="max-w-[320px] truncate font-medium" title={l.articulo_nombre ?? undefined}>
                    {l.articulo_nombre ?? l.articulo_codigo}
                  </p>
                  <p className="font-mono-tabular text-[11px] text-muted-foreground">
                    {l.articulo_codigo} · {l.unidad ?? '—'} · requerimiento {num(l.requerimiento)} · sugerido {num(l.sugerido)}
                  </p>
                </td>
                <td className="px-2 py-1.5 text-right font-mono-tabular font-semibold">{num(l.planificado)}</td>
                <td className="px-2 py-1.5 text-right font-mono-tabular">{l.en_solicitud_plan > 0 ? num(l.en_solicitud_plan) : '—'}</td>
                <td className="px-2 py-1.5 text-right font-mono-tabular">{l.comprado > 0 ? num(l.comprado) : '—'}</td>
                <td className="px-2 py-1.5 text-right font-mono-tabular">{l.recibido > 0 ? num(l.recibido) : '—'}</td>
                <td className="px-2 py-1.5 text-right font-mono-tabular">
                  {l.por_recibir > 0 ? num(l.por_recibir) : '—'}
                  {l.oc_atrasada && <p className="text-[11px] font-semibold text-destructive">OC atrasada</p>}
                </td>
                <td className={cn('px-2 py-1.5 text-right font-mono-tabular', l.sin_oc > 0 && 'font-semibold')}>{l.sin_oc > 0 ? num(l.sin_oc) : '—'}</td>
                <td className="px-2 py-1.5 font-mono-tabular text-xs">{l.docnums ?? '—'}</td>
                <td className="px-2 py-1.5">
                  <Badge variant={ESTADO_LINEA[l.estado_linea].variant}>{ESTADO_LINEA[l.estado_linea].label}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-3 rounded-md border bg-card p-3">
          <p className="text-sm font-bold">OC de SAP asociadas al plan</p>
          {ocs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna asociada a mano. Las OC de las solicitudes del plan cuentan solas.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ocs.map((o) => (
                <span key={o.docnum} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono-tabular text-sm">
                  OC {o.docnum}
                  {esCompras && (
                    <button
                      onClick={() => hacer(() => desvincularOcPlan(plan.id, o.docnum), 'OC quitada del plan')}
                      disabled={ocupado}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Quitar OC ${o.docnum}`}
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          {esCompras && (
            <div className="flex gap-2">
              <Input
                value={docnums}
                onChange={(e) => setDocnums(e.target.value)}
                placeholder="N° de OC, separados por coma"
                className="h-9"
                aria-label="N° de OC a asociar"
              />
              <Button
                size="sm"
                disabled={ocupado}
                onClick={() =>
                  vincular(
                    docnums
                      .split(/[\s,;]+/)
                      .map((x) => Number(x.replace(/\D/g, '')))
                      .filter((x) => x > 0),
                  )
                }
              >
                <Link2 className="mr-1 h-4 w-4" /> Asociar
              </Button>
            </div>
          )}
          {esCompras && candidatas.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">OC recientes con materiales del plan (no se asocian solas)</p>
              <div className="max-h-60 overflow-y-auto rounded border">
                {candidatas.map((c) => (
                  <div key={c.docnum} className="flex items-center gap-2 border-b px-2 py-1.5 text-sm last:border-0">
                    <span className="font-mono-tabular">OC {c.docnum}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={c.proveedor_nombre ?? undefined}>
                      {c.proveedor_nombre} · {fecha(c.fecha)} · {c.articulos} materiales
                    </span>
                    <Button size="sm" variant="outline" disabled={ocupado} onClick={() => vincular([c.docnum])}>
                      Asociar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-2 rounded-md border bg-card p-3">
          <p className="text-sm font-bold">Solicitudes creadas desde el plan</p>
          {solicitudes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay. «Crear solicitud» arma una con lo que falta pedir.</p>
          ) : (
            solicitudes.map((s) => (
              <Link key={s.id} to={RUTA.solicitud(s.id)} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent/50">
                <span className="font-mono-tabular text-muted-foreground">SC-{s.numero}</span>
                <span className="min-w-0 flex-1 truncate">{s.titulo}</span>
                <Badge variant={ESTADO[s.estado].variant}>{ESTADO[s.estado].label}</Badge>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
