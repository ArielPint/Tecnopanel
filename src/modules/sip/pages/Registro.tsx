import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSpreadsheet, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Cargando, Encabezado, SelectorPeriodo, Tile, Vacio, selectClase, usePeriodo } from '../components/comunes'
import { listarLineas, listarPartes, type LineaV, type ParteV } from '../lib/api'
import { resumir } from '../lib/calculo'
import { aDestino } from '../lib/destinos'
import SelectorDestino from '../components/SelectorDestino'
import { exportarRegistroExcel } from '../lib/export'
import { fmtFecha, fmtNum, fmtPct, fmtTramo } from '../lib/formato'
import { RUTA } from '../lib/rutas'
import { usePermisosSip } from '../hooks/usePermisosSip'
import { useCatalogo } from '../hooks/useCatalogo'

export default function Registro() {
  const navigate = useNavigate()
  const { puede } = usePermisosSip('produccion')
  const { paneles, destinos } = useCatalogo()
  const periodo = usePeriodo('semana')
  const [partes, setPartes] = useState<ParteV[]>([])
  const [lineas, setLineas] = useState<LineaV[]>([])
  const [loading, setLoading] = useState(true)
  const [panelId, setPanelId] = useState('')
  const [destino, setDestino] = useState('')
  const [texto, setTexto] = useState('')

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    Promise.all([listarPartes(periodo.desde, periodo.hasta), listarLineas(periodo.desde, periodo.hasta)])
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
  }, [periodo.desde, periodo.hasta])

  // Los filtros son por línea (panel, proyecto, OT); un registro se muestra si alguna línea calza
  const lineasFiltradas = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return lineas.filter(
      (l) =>
        (!panelId || l.panel_id === panelId) &&
        (!destino || aDestino(l) === destino) &&
        (!q || `${l.referencia ?? ''} ${l.panel_codigo} ${l.panel_descripcion} ${l.proyecto_nombre ?? ''}`.toLowerCase().includes(q)),
    )
  }, [lineas, panelId, destino, texto])

  const hayFiltro = !!(panelId || destino || texto.trim())
  const lineasPorParte = useMemo(() => {
    const m = new Map<string, LineaV[]>()
    for (const l of lineasFiltradas) m.set(l.parte_id, [...(m.get(l.parte_id) ?? []), l])
    return m
  }, [lineasFiltradas])
  const partesFiltradas = hayFiltro ? partes.filter((p) => lineasPorParte.has(p.id)) : partes
  const r = resumir(lineasFiltradas)

  return (
    <div className="space-y-4">
      <Encabezado titulo="Registro de producción" descripcion="Paneles fabricados por día o por tramo de horas, con su proyecto u OT." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile titulo="Paneles buenos" valor={fmtNum(r.buenos)} detalle={`${fmtNum(partesFiltradas.length)} registros`} />
        <Tile titulo="m² producidos" valor={fmtNum(r.m2, 1)} detalle="Solo paneles buenos" />
        <Tile titulo="Rechazados" valor={fmtNum(r.rechazados)} detalle="Consumen material igual" />
        <Tile titulo="Tasa de rechazo" valor={fmtPct(r.tasaRechazo)} detalle="Rechazados / total fabricado" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SelectorPeriodo periodo={periodo} />
        <select value={panelId} onChange={(e) => setPanelId(e.target.value)} className={`${selectClase} w-auto max-w-[260px]`} aria-label="Panel">
          <option value="">Todos los paneles</option>
          {paneles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.codigo} · {p.descripcion}
            </option>
          ))}
        </select>
        <SelectorDestino destinos={destinos} valor={destino} onChange={setDestino} vacio="Todos los proyectos" todos className="w-auto max-w-[240px]" aria-label="Proyecto" />
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar OT, pedido o panel" value={texto} onChange={(e) => setTexto(e.target.value)} className="pl-8" />
        </div>
        {puede('exportar') && (
          <Button
            variant="outline"
            onClick={() => exportarRegistroExcel(lineasFiltradas, partes, periodo.desde, periodo.hasta)}
            disabled={lineasFiltradas.length === 0}
          >
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <Cargando />
          ) : partesFiltradas.length === 0 ? (
            <Vacio>No hay producción registrada en este período{hayFiltro ? ' con esos filtros' : ''}.</Vacio>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Paneles</TableHead>
                    <TableHead className="text-right">Buenos</TableHead>
                    <TableHead className="text-right">Rech.</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">m²</TableHead>
                    <TableHead className="hidden md:table-cell">Registrado por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partesFiltradas.map((p) => {
                    const ls = lineasPorParte.get(p.id) ?? []
                    const rp = hayFiltro ? resumir(ls) : { buenos: p.buenos, rechazados: p.rechazados, m2: p.m2_buenos }
                    return (
                      <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(RUTA.parte(p.id))}>
                        <TableCell className="whitespace-nowrap align-top">
                          <div className="font-semibold">{fmtFecha(p.fecha)}</div>
                          <div className="text-xs text-muted-foreground">
                            {fmtTramo(p.hora_desde, p.hora_hasta)} · N° {p.numero}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-col gap-0.5 text-sm">
                            {ls.map((l) => (
                              <span key={l.id}>
                                <span className="font-mono-tabular font-semibold">{l.panel_codigo}</span>{' '}
                                <span className="text-muted-foreground">×{fmtNum(l.total)}</span>
                                {(l.referencia || l.proyecto_nombre) && (
                                  <span className="text-xs text-muted-foreground"> · {[l.proyecto_nombre, l.referencia].filter(Boolean).join(' · ')}</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-top font-mono-tabular font-semibold">{fmtNum(rp.buenos)}</TableCell>
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
