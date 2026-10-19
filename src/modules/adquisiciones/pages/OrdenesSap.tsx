import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { cargarXLSX } from '@/lib/cargarLibrerias'
import { cn } from '@/lib/utils'
import { fmtFecha, fmtFechaHora, hoyChile, sumarDias } from '@/modules/sso/lib/estados'
import { estadoSincronizacion, fmtPesos, listarLineasOcSap, listarOcSap, type LineaOcSap, type OcSap } from '../lib/api'

type Filtro = 'abiertas' | 'sin_facturar' | 'sin_sc' | 'todas'
type FiltroLinea = 'por_recibir' | 'atrasadas' | 'todas'

// dias 0 = todo el historial de SAP (desde 2021)
const PERIODOS = [
  { dias: 30, label: 'Últimos 30 días' },
  { dias: 90, label: 'Últimos 3 meses' },
  { dias: 365, label: 'Último año' },
  { dias: 730, label: 'Últimos 2 años' },
  { dias: 0, label: 'Todo el historial' },
]

const num = (n: number | null | undefined, dec = 2) =>
  n == null ? '—' : new Intl.NumberFormat('es-CL', { maximumFractionDigits: dec }).format(n)
/** Familia de SAP (U_Familia); si el artículo no la tiene, su grupo de artículos. */
const familiaDe = (l: LineaOcSap) => l.familia ?? l.grupo ?? 'Sin familia'

/** OC de SAP (solo lectura) con su detalle por línea y la solicitud del portal a la que están vinculadas. Para Compras. */
export default function OrdenesSap() {
  const [ocs, setOcs] = useState<OcSap[]>([])
  const [lineas, setLineas] = useState<LineaOcSap[]>([])
  const [sincronizado, setSincronizado] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [dias, setDias] = useState(0)
  const [vista, setVista] = useState<'oc' | 'lineas'>('oc')
  const [filtro, setFiltro] = useState<Filtro>('abiertas')
  const [filtroLinea, setFiltroLinea] = useState<FiltroLinea>('por_recibir')
  const [texto, setTexto] = useState('')
  const [sku, setSku] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [familia, setFamilia] = useState('')
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set())

  useEffect(() => {
    setLoading(true)
    const desde = dias ? sumarDias(hoyChile(), -dias) : null
    Promise.all([listarOcSap(desde), listarLineasOcSap(desde), estadoSincronizacion()])
      .then(([o, l, e]) => {
        setOcs(o)
        setLineas(l)
        setSincronizado(e)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [dias])

  const lineasPorOc = useMemo(() => {
    const m = new Map<number, LineaOcSap[]>()
    for (const l of lineas) m.set(l.doc_entry, [...(m.get(l.doc_entry) ?? []), l])
    return m
  }, [lineas])
  const familias = useMemo(() => [...new Set(lineas.map(familiaDe))].sort((a, b) => a.localeCompare(b)), [lineas])

  // Filtros por SKU, proveedor y familia: valen para las dos vistas (en la de OC, la OC tiene alguna línea que cumple)
  const qSku = sku.trim().toLowerCase()
  const qProv = proveedor.trim().toLowerCase()
  const lineaCumple = (l: LineaOcSap) =>
    (!qSku || (l.articulo_codigo ?? '').toLowerCase().includes(qSku) || (l.descripcion ?? '').toLowerCase().includes(qSku)) &&
    (!qProv || (l.proveedor_nombre ?? '').toLowerCase().includes(qProv) || (l.proveedor_codigo ?? '').toLowerCase().includes(qProv)) &&
    (!familia || familiaDe(l) === familia)
  const hayFiltroLinea = !!(qSku || qProv || familia)

  const cumple = (o: OcSap, f: Filtro) => {
    if (f === 'todas') return true
    if (o.cancelada) return false
    if (f === 'abiertas') return o.abierta
    // recibida completa (en SAP), pero con menos del 100% facturado
    if (f === 'sin_facturar') return (o.recepcion_pct ?? 0) >= 100 && (o.facturado_pct ?? 0) < 100
    return !o.solicitudes
  }
  const cumpleLinea = (l: LineaOcSap, f: FiltroLinea) => (f === 'todas' ? true : l.cancelada ? false : f === 'por_recibir' ? l.por_recibir : l.atrasada)

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
      .filter((o) => !hayFiltroLinea || (lineasPorOc.get(o.doc_entry) ?? []).some(lineaCumple))
  }, [ocs, filtro, texto, lineasPorOc, qSku, qProv, familia]) // eslint-disable-line react-hooks/exhaustive-deps

  const listaLineas = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return lineas
      .filter((l) => cumpleLinea(l, filtroLinea))
      .filter(lineaCumple)
      .filter((l) => !q || String(l.docnum) === q || (l.solicitudes ?? '').toLowerCase().includes(q) || (l.ceco ?? '').toLowerCase().includes(q))
  }, [lineas, filtroLinea, texto, qSku, qProv, familia]) // eslint-disable-line react-hooks/exhaustive-deps

  async function exportar() {
    const XLSX = await cargarXLSX()
    // Siempre el detalle por línea: en la vista de OC, el de las OC filtradas
    const docs = new Set(lista.map((o) => o.doc_entry))
    const filas = vista === 'lineas' ? listaLineas : lineas.filter((l) => docs.has(l.doc_entry) && (!hayFiltroLinea || lineaCumple(l)))
    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.json_to_sheet(
        filas.map((l) => ({
          OC: l.docnum,
          Línea: l.linea + 1,
          'Fecha OC': l.fecha,
          'Entrega comprometida': l.fecha_entrega ?? '',
          'Código proveedor': l.proveedor_codigo ?? '',
          Proveedor: l.proveedor_nombre ?? '',
          SKU: l.articulo_codigo ?? '',
          Descripción: l.descripcion ?? '',
          Familia: l.familia ?? '',
          Subfamilia: l.subfamilia ?? '',
          'Grupo SAP': l.grupo ?? '',
          Unidad: l.unidad ?? '',
          Bodega: l.bodega ?? '',
          CECO: l.ceco ?? '',
          'Cantidad comprada': l.cantidad,
          'Cantidad recibida': l.recibido,
          Pendiente: l.pendiente,
          'Precio unitario': l.precio,
          'Total neto línea': l.total,
          'Pendiente neto': l.pendiente_neto,
          Moneda: l.moneda ?? '',
          'Estado OC': l.cancelada ? 'Cancelada' : l.oc_abierta ? 'Abierta' : 'Cerrada',
          Atrasada: l.atrasada ? 'Sí' : '',
          Solicitud: l.solicitudes ?? '',
        })),
      ),
      'Detalle OC',
    )
    XLSX.writeFile(libro, `OC_SAP_${hoyChile()}.xlsx`)
  }

  const chip = (activo: boolean) =>
    cn(
      'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
      activo ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground',
    )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Órdenes de compra en SAP</h1>
        <p className="text-sm text-muted-foreground">
          Lectura de SAP Business One, se actualiza cada hora
          {sincronizado ? ` (última: ${fmtFechaHora(sincronizado)})` : ''}. Una OC con «SC-&lt;número&gt;» en sus comentarios se vincula sola a esa solicitud. Si en SAP la
          fecha de entrega es la misma de la OC, se muestra «sin fecha comprometida»: para ver atrasos reales hay que registrar en SAP la fecha acordada con el
          proveedor.
        </p>
      </div>

      {!loading && !sincronizado && (
        <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
          Todavía no hay datos de SAP en esta base. Se cargan con la tarea de sincronización del servidor.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5">
          {(
            [
              ['oc', 'Por OC'],
              ['lineas', 'Detalle por línea'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setVista(k)}
              className={cn('rounded px-3 py-1 text-xs font-semibold', vista === k ? 'bg-brand/10 text-brand' : 'text-muted-foreground hover:text-foreground')}
            >
              {label}
            </button>
          ))}
        </div>
        {vista === 'oc'
          ? (
              [
                ['abiertas', 'Abiertas'],
                ['sin_facturar', 'Recibidas sin facturar'],
                ['sin_sc', 'Sin solicitud'],
                ['todas', 'Todas'],
              ] as [Filtro, string][]
            ).map(([k, label]) => (
              <button key={k} onClick={() => setFiltro(k)} className={chip(filtro === k)}>
                {label} <span className="tabular-nums opacity-70">{ocs.filter((o) => cumple(o, k)).length}</span>
              </button>
            ))
          : (
              [
                ['por_recibir', 'Por recibir'],
                ['atrasadas', 'Atrasadas'],
                ['todas', 'Todas'],
              ] as [FiltroLinea, string][]
            ).map(([k, label]) => (
              <button key={k} onClick={() => setFiltroLinea(k)} className={chip(filtroLinea === k)}>
                {label} <span className="tabular-nums opacity-70">{lineas.filter((l) => cumpleLinea(l, k) && lineaCumple(l)).length}</span>
              </button>
            ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU o descripción" className="h-9 w-full sm:w-52" aria-label="Buscar por SKU" />
        <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Proveedor" className="h-9 w-full sm:w-52" aria-label="Buscar por proveedor" />
        <select value={familia} onChange={(e) => setFamilia(e.target.value)} className="h-9 max-w-[220px] rounded-md border border-input bg-background px-2 text-sm" aria-label="Familia">
          <option value="">Todas las familias</option>
          {familias.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="N° OC, comentario, CECO o SC" className="h-9 w-full sm:w-56" aria-label="Buscar OC" />
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Período">
          {PERIODOS.map((p) => (
            <option key={p.dias} value={p.dias}>
              {p.label}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" className="ml-auto" disabled={loading} onClick={exportar}>
          <Download className="mr-1 h-4 w-4" /> Excel
        </Button>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded bg-muted" />
      ) : vista === 'lineas' ? (
        listaLineas.length === 0 ? (
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No hay líneas de OC con estos filtros.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">OC · fecha</th>
                  <th className="px-2 py-2 font-semibold">Proveedor</th>
                  <th className="px-2 py-2 font-semibold">SKU · descripción</th>
                  <th className="px-2 py-2 font-semibold">Familia</th>
                  <th className="px-2 py-2 text-right font-semibold">Comprado</th>
                  <th className="px-2 py-2 text-right font-semibold">Recibido</th>
                  <th className="px-2 py-2 text-right font-semibold">Pendiente</th>
                  <th className="px-2 py-2 text-right font-semibold">Precio</th>
                  <th className="px-2 py-2 text-right font-semibold">Total neto</th>
                  <th className="px-2 py-2 font-semibold">Entrega</th>
                </tr>
              </thead>
              <tbody>
                {listaLineas.slice(0, 800).map((l) => (
                  <FilaLinea key={`${l.doc_entry}-${l.linea}`} l={l} conOc />
                ))}
              </tbody>
            </table>
            {listaLineas.length > 800 && (
              <p className="p-3 text-center text-xs text-muted-foreground">Se muestran 800 de {listaLineas.length}. Usa los filtros o descarga el Excel completo.</p>
            )}
          </div>
        )
      ) : lista.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No hay órdenes de compra con estos filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="w-8 px-2 py-2" />
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
              {lista.slice(0, 500).map((o) => {
                const abierta = abiertas.has(o.doc_entry)
                const ls = lineasPorOc.get(o.doc_entry) ?? []
                const alternar = () =>
                  setAbiertas((s) => {
                    const n = new Set(s)
                    if (n.has(o.doc_entry)) n.delete(o.doc_entry)
                    else n.add(o.doc_entry)
                    return n
                  })
                return (
                  <Fragment key={o.doc_entry}>
                    <tr
                      tabIndex={0}
                      onClick={alternar}
                      onKeyDown={(e) => e.key === 'Enter' && alternar()}
                      className={cn('cursor-pointer border-b align-top hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none', abierta && 'bg-accent/30')}
                      aria-expanded={abierta}
                    >
                      <td className="px-2 py-2.5 text-muted-foreground">{abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                      <td className="px-3 py-2.5 font-mono-tabular">
                        {o.docnum}
                        <span className="block text-[11px] text-muted-foreground">{ls.length} líneas</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold">{o.proveedor_nombre ?? '—'}</p>
                        {o.cecos && <p className="font-mono-tabular text-[11px] text-muted-foreground">CECO {o.cecos}</p>}
                        {o.comentarios && (
                          <p className="max-w-[340px] truncate text-xs text-muted-foreground" title={o.comentarios}>
                            {o.comentarios}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono-tabular">
                        {fmtFecha(o.fecha)}
                        <span className="block text-xs text-muted-foreground">{o.fecha_entrega ? fmtFecha(o.fecha_entrega) : 'sin fecha comprometida'}</span>
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
                            <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
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
                    {abierta && (
                      <tr className="border-b bg-muted/30">
                        <td colSpan={8} className="px-3 py-2">
                          {ls.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Sin líneas en el período cargado.</p>
                          ) : (
                            <table className="w-full text-[13px]">
                              <thead>
                                <tr className="text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
                                  <th className="px-2 py-1 font-semibold">SKU · descripción</th>
                                  <th className="px-2 py-1 font-semibold">Familia</th>
                                  <th className="px-2 py-1 text-right font-semibold">Comprado</th>
                                  <th className="px-2 py-1 text-right font-semibold">Recibido</th>
                                  <th className="px-2 py-1 text-right font-semibold">Pendiente</th>
                                  <th className="px-2 py-1 text-right font-semibold">Precio</th>
                                  <th className="px-2 py-1 text-right font-semibold">Total neto</th>
                                  <th className="px-2 py-1 font-semibold">Entrega</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ls.map((l) => (
                                  <FilaLinea key={l.linea} l={l} resaltar={hayFiltroLinea && lineaCumple(l)} />
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {lista.length > 500 && <p className="p-3 text-center text-xs text-muted-foreground">Se muestran 500 de {lista.length}. Usa los filtros o descarga el Excel.</p>}
        </div>
      )}
    </div>
  )
}

function FilaLinea({ l, conOc, resaltar }: { l: LineaOcSap; conOc?: boolean; resaltar?: boolean }) {
  return (
    <tr className={cn('border-b align-top last:border-0', resaltar && 'bg-brand/5', l.cancelada && 'opacity-60')}>
      {conOc && (
        <>
          <td className="whitespace-nowrap px-3 py-1.5 font-mono-tabular">
            {l.docnum}
            <span className="block text-[11px] text-muted-foreground">{fmtFecha(l.fecha)}</span>
          </td>
          <td className="px-2 py-1.5">
            <p className="max-w-[220px] truncate" title={l.proveedor_nombre ?? undefined}>
              {l.proveedor_nombre ?? '—'}
            </p>
            {l.solicitudes && <p className="font-mono-tabular text-[11px] text-muted-foreground">{l.solicitudes}</p>}
          </td>
        </>
      )}
      <td className="px-2 py-1.5">
        <p className="max-w-[300px] truncate" title={l.descripcion ?? undefined}>
          {l.descripcion ?? '—'}
        </p>
        <p className="font-mono-tabular text-[11px] text-muted-foreground">
          {l.articulo_codigo ?? 'sin SKU'} · {l.unidad ?? '—'}
          {l.bodega && ` · ${l.bodega}`}
        </p>
      </td>
      <td className="px-2 py-1.5 text-xs">
        {l.familia ?? <span className="text-muted-foreground">{l.grupo ?? '—'}</span>}
        {l.subfamilia && l.subfamilia !== l.familia && <span className="block text-[11px] text-muted-foreground">{l.subfamilia}</span>}
      </td>
      <td className="px-2 py-1.5 text-right font-mono-tabular">{num(l.cantidad)}</td>
      <td className="px-2 py-1.5 text-right font-mono-tabular text-muted-foreground">{num(l.recibido)}</td>
      <td className={cn('px-2 py-1.5 text-right font-mono-tabular', l.por_recibir && 'font-semibold', l.atrasada && 'text-destructive')}>
        {l.pendiente > 0 ? num(l.pendiente) : '—'}
      </td>
      <td className="px-2 py-1.5 text-right font-mono-tabular">
        {num(l.precio, 4)}
        {l.moneda && l.moneda !== 'CLP' && <span className="ml-1 text-[11px] text-muted-foreground">{l.moneda}</span>}
      </td>
      <td className="px-2 py-1.5 text-right font-mono-tabular">{fmtPesos(l.total)}</td>
      <td className={cn('whitespace-nowrap px-2 py-1.5 font-mono-tabular', l.atrasada && 'font-semibold text-destructive')}>
        {l.fecha_entrega ? fmtFecha(l.fecha_entrega) : <span className="text-[11px] text-muted-foreground">sin fecha</span>}
        {l.atrasada && <span className="block text-[11px]">atrasada</span>}
      </td>
    </tr>
  )
}
