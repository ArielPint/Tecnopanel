import { useMemo, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Button } from '@/modules/financiero/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Badge } from '@/modules/financiero/components/ui/badge'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import { formatCLP, formatFecha } from '@/modules/financiero/utils/formatters'
import { calcCR, calcDifT, calcPct, getVTI, normCod } from '../lib/calc'
import { useAuth } from '../hooks/useAuth'
import { useCatalogoGD } from '../hooks/useCatalogoGD'
import { useResponsables } from '../hooks/useResponsables'
import { useOrdenesCompra } from '../hooks/useOrdenesCompra'
import { useRegistroCompras, type RegistroCompra } from '../hooks/useRegistroCompras'
import FormularioRegistro from '../components/FormularioRegistro'
import ResumenGD from '../components/ResumenGD'

function getPPTO(r: RegistroCompra, allProductsPptoMap: Record<string, number | null>) {
  const p = allProductsPptoMap[normCod(r.codigo)]
  return p ?? r.valor_ppto ?? 0
}

// Comparte la fórmula entre los totales filtrados y el total general (sin filtro) —
// sumMontoGD suma el monto COMPLETO de cada GD presente en `rows`, no solo las líneas
// que matchean el filtro (una guía es una unidad, aunque el filtro esconda alguna línea).
function calcularTotales(rows: RegistroCompra[], pptoMap: Record<string, number | null>, montoPorGD: Record<string, number>) {
  let sumCantSol = 0, sumDevol = 0, sumCantRec = 0, sumVTI = 0, sumPpto = 0, sumDifT = 0
  for (const r of rows) {
    const ppto = getPPTO(r, pptoMap)
    const cr = calcCR(r)
    sumCantSol += r.cantidad_sol || 0
    sumDevol += r.devolucion || 0
    sumCantRec += cr
    sumVTI += getVTI(r)
    sumPpto += ppto * cr
    sumDifT += calcDifT(r, ppto)
  }
  const vundAvg = sumCantRec ? sumVTI / sumCantRec : 0
  const pptoAvg = sumCantRec ? sumPpto / sumCantRec : 0
  const pctAvg = sumPpto ? (sumDifT / sumPpto) * 100 : null
  const gds = new Set(rows.map((r) => r.gd))
  const sumMontoGD = [...gds].reduce((s, gd) => s + (montoPorGD[gd] || 0), 0)
  return { sumCantSol, sumDevol, sumCantRec, sumVTI, vundAvg, pptoAvg, difUndAvg: vundAvg - pptoAvg, sumDifT, pctAvg, sumMontoGD, nGDs: gds.size }
}

export default function Registro() {
  const { perfil, puedeEditar } = useAuth()
  const { allProducts, loading: loadingCatalogo } = useCatalogoGD()
  const { responsables, grupos, loading: loadingResp } = useResponsables()
  const { ordenes, guias, loading: loadingOC } = useOrdenesCompra()
  const { registros, loading, error, crearMulti, actualizarSingle, eliminar } = useRegistroCompras()

  const [search, setSearch] = useState('')
  const [gdFiltro, setGdFiltro] = useState('')
  const [grupoFiltro, setGrupoFiltro] = useState<number | ''>('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [tipo, setTipo] = useState('')

  const grupoPorResponsable = useMemo(() => {
    const map: Record<string, number | null> = {}
    for (const r of responsables) map[r.nombre] = r.grupo_id
    return map
  }, [responsables])

  const gdOCMap = useMemo(() => {
    const numeroPorOC: Record<string, string> = {}
    for (const oc of ordenes) numeroPorOC[oc.id] = oc.numero
    const map: Record<string, string> = {}
    for (const g of guias) {
      const numero = numeroPorOC[g.oc_id]
      if (numero) map[String(g.gd)] = numero
    }
    return map
  }, [ordenes, guias])

  const pptoMap = useMemo(() => {
    const map: Record<string, number | null> = {}
    for (const p of allProducts) map[normCod(p.codigo)] = p.ppto
    return map
  }, [allProducts])

  const filtrados = useMemo(() => {
    const q = search.toLowerCase()
    const gdQ = gdFiltro.trim().toLowerCase()
    return registros.filter((r) => {
      if (gdQ && !String(r.gd).toLowerCase().includes(gdQ)) return false
      if (grupoFiltro && grupoPorResponsable[r.responsable ?? ''] !== grupoFiltro) return false
      if (desde && r.fecha_guia && r.fecha_guia < desde) return false
      if (hasta && r.fecha_guia && r.fecha_guia > hasta) return false
      if (tipo && r.tipo_producto !== tipo) return false
      if (q) {
        const hay = `${r.codigo} ${r.descripcion ?? ''} ${r.obs_modulo ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [registros, search, gdFiltro, grupoFiltro, grupoPorResponsable, desde, hasta, tipo])

  const montoPorGD = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of registros) map[r.gd] = (map[r.gd] || 0) + getVTI(r)
    return map
  }, [registros])

  const totales = useMemo(() => calcularTotales(filtrados, pptoMap, montoPorGD), [filtrados, pptoMap, montoPorGD])
  const totalesGeneral = useMemo(() => calcularTotales(registros, pptoMap, montoPorGD), [registros, pptoMap, montoPorGD])

  const cargandoDeps = loadingCatalogo || loadingResp || loadingOC
  if (error) return <p className="text-destructive">{error}</p>

  const hayFiltros = !!search || !!gdFiltro || !!grupoFiltro || !!desde || !!hasta || !!tipo

  return (
    <div className="space-y-4">
      {!cargandoDeps && <ResumenGD registros={registros} pptoMap={pptoMap} />}
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="🔍  Código, descripción, obs…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-56" />
        <Input placeholder="🔍  GD…" value={gdFiltro} onChange={(e) => setGdFiltro(e.target.value)} className="h-9 w-28" />
        <Select value={grupoFiltro === '' ? '__all' : String(grupoFiltro)} onValueChange={(v) => setGrupoFiltro(v === '__all' ? '' : Number(v))}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Todos los grupos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos los grupos</SelectItem>
            {grupos.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-36" title="Desde" />
        <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-36" title="Hasta" />
        <Select value={tipo || '__all'} onValueChange={(v) => setTipo(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Todos los tipos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos los tipos</SelectItem>
            <SelectItem value="PRODUCTO CRITICO">Crítico</SelectItem>
            <SelectItem value="PRODUCTO NO CRITICO">No crítico</SelectItem>
          </SelectContent>
        </Select>
        {hayFiltros && (
          <Button variant="outline" size="sm" onClick={() => { setSearch(''); setGdFiltro(''); setGrupoFiltro(''); setDesde(''); setHasta(''); setTipo('') }}>
            ✕ Limpiar
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{filtrados.length} de {registros.length} registros</span>
        {puedeEditar && !cargandoDeps && (
          <FormularioRegistro
            registros={registros}
            allProducts={allProducts}
            responsables={responsables}
            gdOCMap={gdOCMap}
            onCrear={(meta, lineas, solicitudNumero) => crearMulti(meta, lineas, perfil?.name ?? 'anon', solicitudNumero)}
            onActualizar={(id, input) => actualizarSingle(id, input, perfil?.name ?? 'anon')}
            onEliminar={eliminar}
          />
        )}
      </div>

      {!loading && !cargandoDeps && filtrados.length === 0 ? (
        <EmptyState icon={ClipboardList} title={registros.length ? 'Sin resultados — ajustá los filtros.' : 'Sin registros. Usá + Nueva entrada.'} />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha Guía</TableHead>
                <TableHead>GD</TableHead>
                <TableHead>OC</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cant. Rec.</TableHead>
                <TableHead className="text-right">Valor Total</TableHead>
                <TableHead className="text-right">Ppto.</TableHead>
                <TableHead className="text-right">Dif. Total</TableHead>
                <TableHead className="text-right">% Dif.</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Monto GD</TableHead>
                {puedeEditar && <TableHead />}
              </TableRow>
            </TableHeader>
            {loading || cargandoDeps ? (
              <TableSkeleton columns={13 + (puedeEditar ? 1 : 0)} />
            ) : (
              <>
                <TableBody>
                  {filtrados.map((r) => {
                    const ppto = getPPTO(r, pptoMap)
                    const difT = calcDifT(r, ppto)
                    const pct = calcPct(r, ppto)
                    const esCritico = (r.tipo_producto || '').includes('CRITICO') && !(r.tipo_producto || '').includes('NO')
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{formatFecha(r.fecha_guia)}</TableCell>
                        <TableCell className="font-mono">{r.gd}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{gdOCMap[r.gd] || '—'}</TableCell>
                        <TableCell className="font-mono text-xs text-primary">{r.codigo}</TableCell>
                        <TableCell className="max-w-xs truncate text-sm" title={r.descripcion ?? ''}>{r.descripcion}</TableCell>
                        <TableCell className="text-right tabular-nums">{calcCR(r).toLocaleString('es-CL')}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatCLP(getVTI(r))}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{ppto ? formatCLP(ppto) : '—'}</TableCell>
                        <TableCell className={`text-right tabular-nums ${difT < 0 ? 'text-success' : difT > 0 ? 'text-destructive' : ''}`}>{difT ? formatCLP(difT) : '—'}</TableCell>
                        <TableCell className={`text-right tabular-nums ${pct != null && pct < 0 ? 'text-success' : pct != null && pct > 0 ? 'text-destructive' : ''}`}>{pct != null ? pct.toFixed(1) + '%' : '—'}</TableCell>
                        <TableCell className="text-xs">{r.responsable || '—'}</TableCell>
                        <TableCell>{r.tipo_producto ? <Badge variant={esCritico ? 'destructive' : 'secondary'}>{esCritico ? 'Crítico' : 'No crítico'}</Badge> : '—'}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-success">{formatCLP(montoPorGD[r.gd] || 0)}</TableCell>
                        {puedeEditar && (
                          <TableCell>
                            <FormularioRegistro
                              registro={r}
                              registros={registros}
                              allProducts={allProducts}
                              responsables={responsables}
                              gdOCMap={gdOCMap}
                              onCrear={(meta, lineas, solicitudNumero) => crearMulti(meta, lineas, perfil?.name ?? 'anon', solicitudNumero)}
                              onActualizar={(id, input) => actualizarSingle(id, input, perfil?.name ?? 'anon')}
                              onEliminar={eliminar}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
                {filtrados.length > 0 && (
                  <tfoot>
                    <TableRow className="bg-muted/40 font-medium">
                      <TableCell colSpan={2} className="text-xs text-muted-foreground">{filtrados.length} ítem{filtrados.length !== 1 ? 's' : ''} · {totales.nGDs} GD{totales.nGDs !== 1 ? 's' : ''}</TableCell>
                      <TableCell colSpan={3} />
                      <TableCell className="text-right tabular-nums">{totales.sumCantRec.toLocaleString('es-CL')}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCLP(totales.sumVTI)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{totales.pptoAvg ? formatCLP(totales.pptoAvg) : '—'}</TableCell>
                      <TableCell className={`text-right tabular-nums ${totales.sumDifT < 0 ? 'text-success' : totales.sumDifT > 0 ? 'text-destructive' : ''}`}>{formatCLP(totales.sumDifT)}</TableCell>
                      <TableCell className="text-right tabular-nums">{totales.pctAvg != null ? totales.pctAvg.toFixed(1) + '%' : '—'}</TableCell>
                      <TableCell colSpan={2} />
                      <TableCell className="text-right tabular-nums text-success">{formatCLP(totales.sumMontoGD)}</TableCell>
                      {puedeEditar && <TableCell />}
                    </TableRow>
                    {grupoFiltro !== '' && (
                      <TableRow className="bg-primary/10 font-medium">
                        <TableCell colSpan={2} className="text-xs text-primary">Total general (todos los grupos) · {totalesGeneral.nGDs} GD{totalesGeneral.nGDs !== 1 ? 's' : ''}</TableCell>
                        <TableCell colSpan={3} />
                        <TableCell className="text-right tabular-nums">{totalesGeneral.sumCantRec.toLocaleString('es-CL')}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCLP(totalesGeneral.sumVTI)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{totalesGeneral.pptoAvg ? formatCLP(totalesGeneral.pptoAvg) : '—'}</TableCell>
                        <TableCell className={`text-right tabular-nums ${totalesGeneral.sumDifT < 0 ? 'text-success' : totalesGeneral.sumDifT > 0 ? 'text-destructive' : ''}`}>{formatCLP(totalesGeneral.sumDifT)}</TableCell>
                        <TableCell className="text-right tabular-nums">{totalesGeneral.pctAvg != null ? totalesGeneral.pctAvg.toFixed(1) + '%' : '—'}</TableCell>
                        <TableCell colSpan={2} />
                        <TableCell className="text-right tabular-nums text-success">{formatCLP(totalesGeneral.sumMontoGD)}</TableCell>
                        {puedeEditar && <TableCell />}
                      </TableRow>
                    )}
                  </tfoot>
                )}
              </>
            )}
          </Table>
        </div>
      )}
    </div>
  )
}
