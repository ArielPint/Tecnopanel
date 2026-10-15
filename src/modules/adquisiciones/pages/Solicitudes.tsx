import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Input } from '@/modules/financiero/components/ui/input'
import { SUCURSALES } from '@/lib/lineasNegocio'
import { cn } from '@/lib/utils'
import { fmtFecha } from '@/modules/sso/lib/estados'
import { usePermisosAdq } from '../hooks/usePermisosAdq'
import { ABIERTOS, ESTADO, type EstadoSolicitud } from '../lib/catalogos'
import { fmtPesos, listarSolicitudes, type Solicitud } from '../lib/api'
import { RUTA } from '../lib/rutas'

type Filtro = 'pendientes' | 'abiertas' | EstadoSolicitud | 'todas'

/** Lo que está esperando a la persona que mira: aprobar, cotizar o vincular la OC. */
function meToca(s: Solicitud, esCompras: boolean) {
  return s.puedo_aprobar || s.puedo_cotizar || (esCompras && s.estado === 'aprobada')
}

function cumple(s: Solicitud, f: Filtro, esCompras: boolean) {
  if (f === 'todas') return true
  if (f === 'pendientes') return meToca(s, esCompras)
  if (f === 'abiertas') return ABIERTOS.includes(s.estado)
  return s.estado === f
}

export function Etapa({ s }: { s: Solicitud }) {
  if (s.estado === 'en_aprobacion')
    return (
      <span className="text-[11px] text-muted-foreground">
        Nivel {s.nivel_aprobado + 1} de {s.nivel_requerido}
        {s.nivel_pendiente_nombre && ` · ${s.nivel_pendiente_nombre}`}
      </span>
    )
  if (s.estado === 'cotizando') return <span className="text-[11px] text-muted-foreground">{s.cotizaciones} cotizaciones</span>
  if (s.estado === 'oc_emitida')
    return (
      <span className="text-[11px] text-muted-foreground">
        OC {s.oc_docnums}
        {s.recepcion_pct != null && ` · recibido ${s.recepcion_pct}%`}
      </span>
    )
  return null
}

/** Solicitudes que la persona puede ver: las suyas, o las de su sucursal si compra o aprueba. */
export default function Solicitudes() {
  const navigate = useNavigate()
  const { esCompras, nivel, loading: cargandoPermisos } = usePermisosAdq()
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro | null>(null)
  const [sucursal, setSucursal] = useState('')
  const [texto, setTexto] = useState('')

  useEffect(() => {
    listarSolicitudes()
      .then(setSolicitudes)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  const porSucursal = useMemo(() => solicitudes.filter((s) => !sucursal || s.sucursal === sucursal), [solicitudes, sucursal])
  const pendientes = porSucursal.filter((s) => meToca(s, esCompras)).length
  // Quien compra o aprueba parte en "Me toca" si tiene algo; el resto, en abiertas
  const f: Filtro = filtro ?? ((esCompras || nivel > 0) && pendientes > 0 ? 'pendientes' : 'abiertas')

  const FILTROS: { key: Filtro; label: string }[] = [
    ...(esCompras || nivel > 0 ? [{ key: 'pendientes' as Filtro, label: 'Me toca' }] : []),
    { key: 'abiertas', label: 'Abiertas' },
    { key: 'cotizando', label: ESTADO.cotizando.label },
    { key: 'en_aprobacion', label: ESTADO.en_aprobacion.label },
    { key: 'aprobada', label: 'Aprobadas' },
    { key: 'oc_emitida', label: ESTADO.oc_emitida.label },
    { key: 'recibida', label: 'Recibidas' },
    { key: 'rechazada', label: 'Rechazadas' },
    { key: 'anulada', label: 'Anuladas' },
    { key: 'todas', label: 'Todas' },
  ]

  const lista = useMemo(() => {
    const q = texto.trim().toLowerCase().replace(/^sc-?/, '')
    return porSucursal
      .filter((s) => cumple(s, f, esCompras))
      .filter(
        (s) =>
          !q ||
          s.titulo.toLowerCase().includes(q) ||
          s.area.toLowerCase().includes(q) ||
          String(s.numero) === q ||
          (s.proveedor_elegido ?? '').toLowerCase().includes(q) ||
          s.oc_docnums.split(', ').includes(q) ||
          (s.creado_por_nombre ?? '').toLowerCase().includes(q),
      )
      // urgentes primero entre las abiertas; después lo más nuevo
      .sort(
        (a, b) =>
          Number(ABIERTOS.includes(b.estado) && b.prioridad === 'urgente') - Number(ABIERTOS.includes(a.estado) && a.prioridad === 'urgente') ||
          b.created_at.localeCompare(a.created_at),
      )
  }, [porSucursal, f, texto, esCompras])

  const cuenta = (k: Filtro) => porSucursal.filter((s) => cumple(s, k, esCompras)).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Solicitudes de compra</h1>
        <p className="text-sm text-muted-foreground">De la solicitud a la recepción: cotizaciones, aprobación por montos y la OC emitida en SAP.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((x) => (
          <button
            key={x.key}
            onClick={() => setFiltro(x.key)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              f === x.key ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {x.label} <span className="tabular-nums opacity-70">{cuenta(x.key)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por SC, OC, título, proveedor o persona" className="h-9 w-full sm:w-80" />
        <select value={sucursal} onChange={(e) => setSucursal(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Sucursal">
          <option value="">Todas las sucursales</option>
          {SUCURSALES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading || cargandoPermisos ? (
        <div className="h-40 animate-pulse rounded bg-muted" />
      ) : lista.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {solicitudes.length === 0 ? 'Todavía no hay solicitudes que puedas ver.' : f === 'pendientes' ? 'No tienes nada pendiente.' : 'No hay solicitudes con estos filtros.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">SC</th>
                <th className="px-3 py-2 font-semibold">Qué se compra</th>
                <th className="px-3 py-2 font-semibold">Área · sucursal</th>
                <th className="px-3 py-2 font-semibold">Se necesita</th>
                <th className="px-3 py-2 text-right font-semibold">Monto neto</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => (
                <tr
                  key={s.id}
                  tabIndex={0}
                  onClick={() => navigate(RUTA.solicitud(s.id))}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(RUTA.solicitud(s.id))}
                  className="cursor-pointer border-b last:border-0 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                >
                  <td className="px-3 py-2.5 font-mono-tabular text-muted-foreground">SC-{s.numero}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold">
                      {s.prioridad === 'urgente' && ABIERTOS.includes(s.estado) && (
                        <Badge variant="destructive" className="mr-1.5 align-[1px]">
                          Urgente
                        </Badge>
                      )}
                      {s.titulo}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.items} {s.items === 1 ? 'ítem' : 'ítems'} · {s.creado_por_nombre ?? '—'}
                      {s.proyecto_nombre && ` · ${s.proyecto_nombre}`}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p>{s.area}</p>
                    <p className="text-xs text-muted-foreground">{s.sucursal}</p>
                  </td>
                  <td className="px-3 py-2.5 font-mono-tabular">{fmtFecha(s.fecha_requerida)}</td>
                  <td className="px-3 py-2.5 text-right font-mono-tabular">
                    <p>{fmtPesos(s.monto_referencia)}</p>
                    {s.monto_aprobacion == null && s.monto_referencia != null && <p className="text-[11px] text-muted-foreground">estimado</p>}
                    {s.proveedor_elegido && <p className="max-w-[180px] truncate text-[11px] text-muted-foreground">{s.proveedor_elegido}</p>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant={ESTADO[s.estado].variant}>{ESTADO[s.estado].label}</Badge>
                      <Etapa s={s} />
                      {meToca(s, esCompras) && <span className="text-[11px] font-semibold text-brand">Te toca</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
