import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSpreadsheet, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Cargando, SelectorPeriodo, Tile, Vacio, selectClase, usePeriodo } from '../components/comunes'
import { listarLineasCorte, listarPartesCorte, type LineaCorteV, type ParteCorteV } from '../lib/api'
import { fmtPesos, nombreCorte, resumirCortes } from '../lib/cortes'
import { exportarCortesExcel } from '../lib/export'
import { fmtFecha, fmtNum, fmtPct, fmtTramo } from '../lib/formato'
import { RUTA } from '../lib/rutas'
import { usePermisosSip } from '../hooks/usePermisosSip'
import { useSucursalSip } from '../hooks/useSucursalSip'

/** Registro de cortes por día o tramo de horas. */
export default function Cortes() {
  const navigate = useNavigate()
  const { puede } = usePermisosSip('cortes')
  const { sucursal } = useSucursalSip()
  const periodo = usePeriodo('semana')
  const [partes, setPartes] = useState<ParteCorteV[]>([])
  const [lineas, setLineas] = useState<LineaCorteV[]>([])
  const [loading, setLoading] = useState(true)
  const [proyecto, setProyecto] = useState('')
  const [texto, setTexto] = useState('')

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    Promise.all([listarPartesCorte(periodo.desde, periodo.hasta, sucursal), listarLineasCorte({ desde: periodo.desde, hasta: periodo.hasta, sucursal })])
      .then(([p, l]) => {
        if (cancelado) return
        setPartes(p)
        setLineas(l)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => !cancelado && setLoading(false))
    return () => {
      cancelado = true
    }
  }, [periodo.desde, periodo.hasta, sucursal])

  const proyectos = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of lineas) m.set(l.proyecto_codigo, l.proyecto_nombre)
    return [...m].sort((a, b) => b[0].localeCompare(a[0]))
  }, [lineas])

  const lineasFiltradas = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return lineas.filter(
      (l) =>
        (!proyecto || l.proyecto_codigo === proyecto) &&
        (!q || `${l.referencia ?? ''} ${l.panel_codigo} ${l.panel_descripcion} ${l.modelo_vivienda} ${l.proyecto_nombre}`.toLowerCase().includes(q)),
    )
  }, [lineas, proyecto, texto])

  const hayFiltro = !!(proyecto || texto.trim())
  const lineasPorParte = useMemo(() => {
    const m = new Map<string, LineaCorteV[]>()
    for (const l of lineasFiltradas) m.set(l.parte_id, [...(m.get(l.parte_id) ?? []), l])
    return m
  }, [lineasFiltradas])
  const partesFiltradas = hayFiltro ? partes.filter((p) => lineasPorParte.has(p.id)) : partes
  const r = resumirCortes(lineasFiltradas)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile titulo="Paneles cortados" valor={fmtNum(r.cortados)} detalle={`${fmtNum(partesFiltradas.length)} registros`} />
        <Tile titulo="m² cortados" valor={fmtNum(r.m2, 1)} detalle="Solo paneles cortados" />
        <Tile titulo="Rechazados" valor={fmtNum(r.rechazados)} detalle={`Tasa ${fmtPct(r.tasaRechazo)}`} />
        <Tile titulo="Maquila de corte" valor={fmtPesos(r.costo)} detalle="m² × precio de SAP" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SelectorPeriodo periodo={periodo} />
        <select value={proyecto} onChange={(e) => setProyecto(e.target.value)} className={`${selectClase} w-auto max-w-[280px]`} aria-label="Proyecto">
          <option value="">Todos los proyectos</option>
          {proyectos.map(([codigo, nombre]) => (
            <option key={codigo} value={codigo}>
              {codigo} · {nombre}
            </option>
          ))}
        </select>
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar OT, panel o modelo" value={texto} onChange={(e) => setTexto(e.target.value)} className="pl-8" />
        </div>
        {puede('exportar') && (
          <Button variant="outline" onClick={() => exportarCortesExcel(lineasFiltradas, periodo.desde, periodo.hasta)} disabled={lineasFiltradas.length === 0}>
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <Cargando />
          ) : partesFiltradas.length === 0 ? (
            <Vacio>No hay cortes registrados en este período{hayFiltro ? ' con esos filtros' : ''}.</Vacio>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cortes</TableHead>
                    <TableHead className="text-right">Cortados</TableHead>
                    <TableHead className="text-right">Rech.</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">m²</TableHead>
                    <TableHead className="hidden md:table-cell">Registrado por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partesFiltradas.map((p) => {
                    const ls = lineasPorParte.get(p.id) ?? []
                    const rp = hayFiltro ? resumirCortes(ls) : { cortados: p.cortados, rechazados: p.rechazados, m2: p.m2_cortados }
                    return (
                      <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(RUTA.corte(p.id))}>
                        <TableCell className="whitespace-nowrap align-top">
                          <div className="font-semibold">{fmtFecha(p.fecha)}</div>
                          <div className="text-xs text-muted-foreground">
                            {fmtTramo(p.hora_desde, p.hora_hasta)} · N° {p.numero}
                            {sucursal === 'todas' && ` · ${p.sucursal}`}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-col gap-0.5 text-sm">
                            {ls.map((l) => (
                              <span key={l.id}>
                                <span className="font-mono-tabular font-semibold">{l.panel_codigo}</span>{' '}
                                <span className="text-muted-foreground">×{fmtNum(l.total)}</span>
                                <span className="text-xs text-muted-foreground">
                                  {' '}
                                  · {nombreCorte(l.corte_descripcion)} · {l.proyecto_nombre}
                                  {l.modelo_vivienda && ` · ${l.modelo_vivienda}`}
                                  {l.referencia && ` · ${l.referencia}`}
                                </span>
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-top font-mono-tabular font-semibold">{fmtNum(rp.cortados)}</TableCell>
                        <TableCell className="text-right align-top font-mono-tabular">{rp.rechazados ? fmtNum(rp.rechazados) : '—'}</TableCell>
                        <TableCell className="hidden text-right align-top font-mono-tabular sm:table-cell">{fmtNum(rp.m2, 1)}</TableCell>
                        <TableCell className="hidden align-top text-sm text-muted-foreground md:table-cell">{p.registrado_por ?? '—'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
