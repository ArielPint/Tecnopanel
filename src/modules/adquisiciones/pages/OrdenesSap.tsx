import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Input } from '@/modules/financiero/components/ui/input'
import { cn } from '@/lib/utils'
import { fmtFecha, fmtFechaHora, hoyChile, sumarDias } from '@/modules/sso/lib/estados'
import { estadoSincronizacion, fmtPesos, listarOcSap, type OcSap } from '../lib/api'

type Filtro = 'abiertas' | 'sin_facturar' | 'sin_sc' | 'todas'

const PERIODOS = [
  { dias: 30, label: 'Últimos 30 días' },
  { dias: 90, label: 'Últimos 3 meses' },
  { dias: 365, label: 'Último año' },
]

/** OC de SAP (solo lectura) con la solicitud del portal a la que están vinculadas. Para Compras. */
export default function OrdenesSap() {
  const [ocs, setOcs] = useState<OcSap[]>([])
  const [sincronizado, setSincronizado] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [dias, setDias] = useState(90)
  const [filtro, setFiltro] = useState<Filtro>('abiertas')
  const [texto, setTexto] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([listarOcSap(sumarDias(hoyChile(), -dias)), estadoSincronizacion()])
      .then(([o, e]) => {
        setOcs(o)
        setSincronizado(e)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [dias])

  const cumple = (o: OcSap, f: Filtro) => {
    if (f === 'todas') return true
    if (o.cancelada) return false
    if (f === 'abiertas') return o.abierta
    // recibida completa (en SAP), pero con menos del 100% facturado
    if (f === 'sin_facturar') return (o.recepcion_pct ?? 0) >= 100 && (o.facturado_pct ?? 0) < 100
    return !o.solicitudes
  }

  const lista = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return ocs
      .filter((o) => cumple(o, filtro))
      .filter(
        (o) =>
          !q ||
          String(o.docnum) === q ||
          (o.proveedor_nombre ?? '').toLowerCase().includes(q) ||
          (o.comentarios ?? '').toLowerCase().includes(q) ||
          (o.solicitudes ?? '').toLowerCase().includes(q) ||
          (o.cecos ?? '').toLowerCase().includes(q),
      )
  }, [ocs, filtro, texto])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Órdenes de compra en SAP</h1>
        <p className="text-sm text-muted-foreground">
          Lectura de SAP Business One, se actualiza cada hora
          {sincronizado ? ` (última: ${fmtFechaHora(sincronizado)})` : ''}. Una OC con «SC-&lt;número&gt;» en sus comentarios se vincula sola a esa solicitud.
        </p>
      </div>

      {!loading && !sincronizado && (
        <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          Todavía no hay datos de SAP en esta base. Se cargan con la tarea de sincronización del servidor.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['abiertas', 'Abiertas'],
            ['sin_facturar', 'Recibidas sin facturar'],
            ['sin_sc', 'Sin solicitud'],
            ['todas', 'Todas'],
          ] as [Filtro, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFiltro(k)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              filtro === k ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {label} <span className="tabular-nums opacity-70">{ocs.filter((o) => cumple(o, k)).length}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por N°, proveedor, comentario, CECO o SC" className="h-9 w-full sm:w-80" />
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Período">
          {PERIODOS.map((p) => (
            <option key={p.dias} value={p.dias}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded bg-muted" />
      ) : lista.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No hay órdenes de compra con estos filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">OC</th>
                <th className="px-3 py-2 font-semibold">Proveedor</th>
                <th className="px-3 py-2 font-semibold">Fecha · entrega</th>
                <th className="px-3 py-2 text-right font-semibold">Total con IVA</th>
                <th className="px-3 py-2 font-semibold">Recepción</th>
                <th className="px-3 py-2 font-semibold">Facturado</th>
                <th className="px-3 py-2 font-semibold">Solicitud</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((o) => (
                <tr key={o.doc_entry} className="border-b align-top last:border-0">
                  <td className="px-3 py-2.5 font-mono-tabular">{o.docnum}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold">{o.proveedor_nombre ?? '—'}</p>
                    {o.cecos && <p className="font-mono-tabular text-[11px] text-muted-foreground">CECO {o.cecos}</p>}
                    {o.comentarios && <p className="max-w-[340px] truncate text-xs text-muted-foreground" title={o.comentarios}>{o.comentarios}</p>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono-tabular">
                    {fmtFecha(o.fecha)}
                    <span className="block text-xs text-muted-foreground">{fmtFecha(o.fecha_entrega)}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono-tabular">
                    {fmtPesos(o.total)}
                    {o.moneda && o.moneda !== 'CLP' && <span className="ml-1 text-xs text-muted-foreground">{o.moneda}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {o.cancelada ? (
                      <Badge variant="secondary">Cancelada</Badge>
                    ) : (
                      <div className="min-w-[110px]">
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-brand" style={{ width: `${o.recepcion_pct ?? 0}%` }} />
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                          {o.recepcion_pct ?? 0}% · {o.abierta ? 'abierta' : 'cerrada'}
                        </p>
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                    {o.cancelada ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>
                        <span className={cn('font-semibold tabular-nums', (o.facturado_pct ?? 0) >= 100 && 'text-success')}>{o.facturado_pct ?? 0}%</span>
                        <span className="block font-mono-tabular text-muted-foreground">{fmtPesos(o.facturado)}</span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono-tabular text-xs">{o.solicitudes ?? <span className="text-muted-foreground">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
