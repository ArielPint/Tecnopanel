import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, ClipboardCheck, FileText, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  CLASE,
  CRITERIOS,
  anularEvaluacion,
  fmtPesos,
  listarEvaluaciones,
  listarNc,
  listarOcProveedor,
  obtenerProveedor,
  type Evaluacion,
  type Nc,
  type OcSap,
  type ProveedorFicha,
} from '../lib/api'
import { descargarCarta } from '../lib/cartaEvaluacion'
import { RUTA } from '../lib/rutas'
import { usePermisosAdq } from '../hooks/usePermisosAdq'
import { DialogoEvaluacion, DialogoNc } from '../components/DialogosProveedor'
import { TablaNc } from './NoConformidades'

// Ficha de un proveedor: indicadores de compra de SAP, evaluaciones (con su carta) y no conformidades.

const fecha = (s: string | null) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString('es-CL') : '—')

export default function Proveedor() {
  const { codigo = '' } = useParams<{ codigo: string }>()
  const { sucursales } = usePermisosAdq()
  const [p, setP] = useState<ProveedorFicha | null>(null)
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([])
  const [ncs, setNcs] = useState<Nc[]>([])
  const [ocs, setOcs] = useState<OcSap[]>([])
  const [loading, setLoading] = useState(true)
  const [pestana, setPestana] = useState<'evaluaciones' | 'nc' | 'oc'>('evaluaciones')
  const [evaluar, setEvaluar] = useState(false)
  const [nuevaNc, setNuevaNc] = useState(false)
  const [anular, setAnular] = useState<Evaluacion | null>(null)
  const [motivo, setMotivo] = useState('')

  const cargar = useCallback(async () => {
    try {
      const [pr, ev, nc, oc] = await Promise.all([obtenerProveedor(codigo), listarEvaluaciones(codigo), listarNc(codigo), listarOcProveedor(codigo)])
      setP(pr)
      setEvaluaciones(ev)
      setNcs(nc)
      setOcs(oc)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [codigo])
  useEffect(() => {
    cargar()
  }, [cargar])

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />
  if (!p)
    return (
      <div className="space-y-3">
        <Link to={RUTA.proveedores} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a proveedores
        </Link>
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">El proveedor no existe o no tienes acceso.</p>
      </div>
    )

  const proveedor = { codigo: p.codigo, nombre: p.nombre }
  const indicadores: [string, string, boolean?][] = [
    ['Comprado 12 meses', fmtPesos(p.comprado_12m)],
    ['OC 12 meses', String(p.oc_12m)],
    ['Pendiente por recibir', fmtPesos(p.pendiente_neto)],
    ['Líneas atrasadas', String(p.lineas_atrasadas), p.lineas_atrasadas > 0],
    ['Recepción 12 meses', p.recepcion_pct == null ? '—' : `${p.recepcion_pct}%`],
    ['NC abiertas', String(p.nc_abiertas), p.nc_abiertas > 0],
  ]

  return (
    <div className="space-y-4">
      <Link to={RUTA.proveedores} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a proveedores
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono-tabular text-xs text-muted-foreground">
            Proveedor SAP {p.codigo}
            {p.rut && ` · RUT ${p.rut}`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold">{p.nombre}</h1>
            {p.ultima_clase && (
              <Badge variant={CLASE[p.ultima_clase].variant}>
                {CLASE[p.ultima_clase].label} · {p.ultima_puntaje?.toLocaleString('es-CL')}
              </Badge>
            )}
            {!p.activo && <Badge variant="secondary">Inactivo en SAP</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {[p.email, p.telefono].filter(Boolean).join(' · ') || 'Sin contacto en SAP'}
            {p.proxima_revision && ` · próxima revisión ${fecha(p.proxima_revision)}`}
            {p.revision_vencida && <span className="font-semibold text-warning"> (vencida)</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setNuevaNc(true)}>
            <Plus className="mr-1 h-4 w-4" /> Registrar NC
          </Button>
          <Button size="sm" onClick={() => setEvaluar(true)}>
            <ClipboardCheck className="mr-1 h-4 w-4" /> Evaluar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {indicadores.map(([k, v, alerta]) => (
          <div key={k} className="rounded-md border bg-card px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</p>
            <p className={cn('font-mono-tabular text-lg font-bold', alerta && 'text-destructive')}>{v}</p>
          </div>
        ))}
      </div>

      <div className="flex rounded-md border p-0.5 sm:w-fit">
        {(
          [
            ['evaluaciones', `Evaluaciones (${evaluaciones.length})`],
            ['nc', `No conformidades (${ncs.length})`],
            ['oc', `OC de SAP (${ocs.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setPestana(k)}
            className={cn('flex-1 rounded px-3 py-1 text-xs font-semibold', pestana === k ? 'bg-brand/10 text-brand' : 'text-muted-foreground hover:text-foreground')}
          >
            {label}
          </button>
        ))}
      </div>

      {pestana === 'evaluaciones' &&
        (evaluaciones.length === 0 ? (
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">Este proveedor todavía no tiene evaluaciones.</p>
        ) : (
          <div className="space-y-3">
            {evaluaciones.map((e) => (
              <div key={e.id} className={cn('rounded-md border bg-card p-3', e.anulada && 'opacity-60')}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={CLASE[e.clase].variant}>{CLASE[e.clase].label}</Badge>
                  <span className="font-mono-tabular text-lg font-bold">{e.puntaje.toLocaleString('es-CL')}</span>
                  <span className="text-sm text-muted-foreground">
                    período {fecha(e.periodo_desde)} al {fecha(e.periodo_hasta)} · {e.creado_por_nombre ?? '—'} · {fecha(e.created_at)}
                  </span>
                  {e.anulada ? (
                    <Badge variant="secondary">Anulada</Badge>
                  ) : (
                    <div className="ml-auto flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => descargarCarta(e).catch(() => toast.error('No se pudo generar la carta'))}>
                        <FileText className="mr-1 h-4 w-4" /> Carta PDF
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setAnular(e)}>
                        <Ban className="mr-1 h-4 w-4" /> Anular
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {CRITERIOS.map((c) => (
                    <span key={c.campo} className={cn(e[c.campo] <= 2 && 'font-semibold text-destructive')}>
                      {c.label} <span className="font-mono-tabular">{e[c.campo]}/5</span>
                    </span>
                  ))}
                </div>
                {e.observaciones && <p className="mt-2 text-sm">{e.observaciones}</p>}
                {e.plan_accion && <p className="mt-1 text-sm text-muted-foreground">Plan de acción: {e.plan_accion}</p>}
                {e.anulada && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Anulada el {fecha(e.anulada_at)} por {e.anulada_por_nombre}: {e.motivo_anulacion}
                  </p>
                )}
              </div>
            ))}
          </div>
        ))}

      {pestana === 'nc' && <TablaNc filas={ncs} mostrarProveedor={false} onCambio={cargar} />}

      {pestana === 'oc' &&
        (ocs.length === 0 ? (
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">Sin OC desde el 1 de enero del año pasado.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">OC</th>
                  <th className="px-3 py-2 font-semibold">Fecha</th>
                  <th className="px-3 py-2 font-semibold">Entrega</th>
                  <th className="px-3 py-2 text-right font-semibold">Neto</th>
                  <th className="px-3 py-2 text-right font-semibold">Recibido</th>
                  <th className="px-3 py-2 text-right font-semibold">Facturado</th>
                  <th className="px-3 py-2 font-semibold">Solicitud</th>
                </tr>
              </thead>
              <tbody>
                {ocs.map((o) => {
                  const atrasada = o.abierta && !!o.fecha_entrega && o.fecha_entrega < new Date().toISOString().slice(0, 10)
                  return (
                    <tr key={o.doc_entry} className="border-b last:border-0">
                      <td className="px-3 py-2 font-mono-tabular">
                        {o.docnum}
                        {o.cancelada && <span className="ml-1 text-xs text-muted-foreground">cancelada</span>}
                      </td>
                      <td className="px-3 py-2 font-mono-tabular">{fecha(o.fecha)}</td>
                      <td className={cn('px-3 py-2 font-mono-tabular', atrasada && 'font-semibold text-destructive')}>{fecha(o.fecha_entrega)}</td>
                      <td className="px-3 py-2 text-right font-mono-tabular">{fmtPesos(o.neto)}</td>
                      <td className="px-3 py-2 text-right font-mono-tabular">{o.recepcion_pct == null ? '—' : `${o.recepcion_pct}%`}</td>
                      <td className="px-3 py-2 text-right font-mono-tabular">{o.facturado_pct == null ? '—' : `${o.facturado_pct}%`}</td>
                      <td className="px-3 py-2 text-xs">{o.solicitudes ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}

      <DialogoEvaluacion abierto={evaluar} proveedor={proveedor} onCerrar={() => setEvaluar(false)} onGuardado={cargar} />
      <DialogoNc abierto={nuevaNc} nc={null} proveedor={proveedor} sucursales={sucursales.compras} onCerrar={() => setNuevaNc(false)} onGuardado={cargar} />

      <Dialog open={!!anular} onOpenChange={(o) => !o && (setAnular(null), setMotivo(''))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular evaluación</DialogTitle>
            <DialogDescription>La evaluación queda anulada para auditoría, no se borra. Después puedes registrar la corregida.</DialogDescription>
          </DialogHeader>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo de la anulación" aria-label="Motivo de la anulación" />
          <DialogFooter>
            <Button variant="outline" onClick={() => (setAnular(null), setMotivo(''))}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!motivo.trim()}
              onClick={async () => {
                if (!anular) return
                try {
                  await anularEvaluacion(anular.id, motivo)
                  toast.success('Evaluación anulada')
                  setAnular(null)
                  setMotivo('')
                  cargar()
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'No se pudo anular')
                }
              }}
            >
              Anular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
