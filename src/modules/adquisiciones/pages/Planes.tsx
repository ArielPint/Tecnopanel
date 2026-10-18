import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { cn } from '@/lib/utils'
import { BODEGAS, fmtPesos, listarPlanes, type PlanCompra } from '../lib/api'
import { RUTA } from '../lib/rutas'

// Planes de compra guardados desde Planificación: una versión por bodega y período, con el avance de lo
// planificado contra lo comprado en OC de SAP.

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const nombrePlan = (p: Pick<PlanCompra, 'anio' | 'mes' | 'version' | 'bodega_codigo'>) =>
  `${MESES[p.mes - 1]} ${p.anio} · V${p.version} · ${p.bodega_codigo}`

export default function Planes() {
  const navigate = useNavigate()
  const [planes, setPlanes] = useState<PlanCompra[]>([])
  const [loading, setLoading] = useState(true)
  const [estado, setEstado] = useState<'abierto' | 'cerrado' | 'todos'>('abierto')

  useEffect(() => {
    listarPlanes()
      .then(setPlanes)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  const lista = useMemo(() => planes.filter((p) => estado === 'todos' || p.estado === estado), [planes, estado])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Planes de compra</h1>
        <p className="text-sm text-muted-foreground">
          Lo aprobado en Planificación, por versión. Cada plan sigue lo planificado contra lo pedido en solicitudes, lo comprado en OC de SAP y lo recibido.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['abierto', 'Abiertos'],
            ['cerrado', 'Cerrados'],
            ['todos', 'Todos'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setEstado(k)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              estado === k ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {label} <span className="tabular-nums opacity-70">{planes.filter((p) => k === 'todos' || p.estado === k).length}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded bg-muted" />
      ) : lista.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {planes.length === 0 ? 'Todavía no hay planes. Se crean desde Planificación con «Guardar plan».' : 'No hay planes con este filtro.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Plan</th>
                <th className="px-3 py-2 font-semibold">Bodega</th>
                <th className="px-3 py-2 text-right font-semibold">Materiales</th>
                <th className="px-3 py-2 text-right font-semibold">Valor ref.</th>
                <th className="px-3 py-2 font-semibold">Avance en OC</th>
                <th className="px-3 py-2 font-semibold">Solicitudes</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr
                  key={p.id}
                  tabIndex={0}
                  onClick={() => navigate(RUTA.plan(p.id))}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(RUTA.plan(p.id))}
                  className="cursor-pointer border-b last:border-0 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                >
                  <td className="px-3 py-2.5">
                    <p className="font-semibold">N° {p.numero} · {nombrePlan(p)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString('es-CL')} · {p.creado_por_nombre ?? '—'}
                      {p.nota && ` · ${p.nota}`}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">{BODEGAS[p.bodega_codigo]}</td>
                  <td className="px-3 py-2.5 text-right font-mono-tabular">{p.lineas}</td>
                  <td className="px-3 py-2.5 text-right font-mono-tabular">{fmtPesos(p.valor_planificado)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-brand" style={{ width: `${Math.min(100, p.avance_pct)}%` }} />
                      </div>
                      <span className="font-mono-tabular text-xs">{p.avance_pct}%</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{p.oc} OC</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs">{p.solicitudes || '—'}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant={p.estado === 'abierto' ? 'default' : 'secondary'}>{p.estado === 'abierto' ? 'Abierto' : 'Cerrado'}</Badge>
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
