import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClipboardCheck, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { cn } from '@/lib/utils'
import {
  cumplimiento,
  exportarInspeccionesExcel,
  listarInspecciones,
  listarPlantillas,
  listarPrograma,
  listarRespuestas,
  type InspeccionV,
  type Plantilla,
  type Programa,
  type SituacionPrograma,
} from '../lib/apiInspecciones'
import { fmtFecha, hoyChile } from '../lib/estados'
import { RUTA } from '../lib/rutas'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

const SITUACION: Record<SituacionPrograma, { label: string; clase: string; orden: number }> = {
  atrasada: { label: 'Atrasada', clase: 'bg-red-600 text-white', orden: 0 },
  nunca: { label: 'Sin inspeccionar', clase: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200', orden: 1 },
  proxima: { label: 'Esta semana', clase: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200', orden: 2 },
  al_dia: { label: 'Al día', clase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200', orden: 3 },
}

function Tile({ titulo, valor, alerta }: { titulo: string; valor: number; alerta?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <p className={cn('mt-1 font-mono-tabular text-2xl font-extrabold', alerta && valor > 0 && 'text-red-700 dark:text-red-400')}>{valor}</p>
      </CardContent>
    </Card>
  )
}

/** Programa: por plantilla periódica y área, cuándo fue la última inspección y cuándo toca la próxima. */
export function ProgramaInspecciones() {
  const { puede } = usePermisosSso('inspecciones')
  const { nombreArea } = useDatosSso()
  const [programa, setPrograma] = useState<Programa[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listarPrograma()
      .then(setPrograma)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  const ordenado = [...programa].sort((a, b) => SITUACION[a.situacion].orden - SITUACION[b.situacion].orden || a.proxima.localeCompare(b.proxima))
  const n = (s: SituacionPrograma) => programa.filter((p) => p.situacion === s).length

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile titulo="Atrasadas" valor={n('atrasada')} alerta />
        <Tile titulo="Sin inspeccionar" valor={n('nunca')} alerta />
        <Tile titulo="Tocan esta semana" valor={n('proxima')} />
        <Tile titulo="Al día" valor={n('al_dia')} />
      </div>
      <Card>
        <CardContent className="pt-4">
          {programa.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay plantillas con periodicidad. Defínelas en la pestaña Plantillas para armar el programa.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plantilla</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Última</TableHead>
                  <TableHead>Próxima</TableHead>
                  <TableHead>Situación</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenado.map((p) => (
                  <TableRow key={`${p.checklist_id}:${p.area_id ?? ''}`}>
                    <TableCell>
                      <p className="font-medium">{p.checklist}</p>
                      <p className="text-xs text-muted-foreground">cada {p.periodicidad_dias} días</p>
                    </TableCell>
                    <TableCell>{p.area_id ? nombreArea(p.area_id) : 'General'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {p.ultima_id ? (
                        <Link to={RUTA.inspeccion(p.ultima_id)} className="hover:underline">
                          {fmtFecha(p.ultima)}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{p.ultima ? fmtFecha(p.proxima) : 'Ahora'}</TableCell>
                    <TableCell>
                      <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', SITUACION[p.situacion].clase)}>
                        {SITUACION[p.situacion].label}
                        {p.situacion === 'atrasada' && ` ${p.dias_atraso} d`}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {puede('crear') && (
                        <Button asChild size="sm" variant={p.situacion === 'al_dia' ? 'ghost' : 'outline'}>
                          <Link to={RUTA.nuevaInspeccion(p.checklist_id, p.area_id)}>
                            <ClipboardCheck className="mr-1 h-4 w-4" /> Inspeccionar
                          </Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Inspecciones realizadas, con su cumplimiento y los hallazgos que generaron. */
export function InspeccionesRealizadas() {
  const navigate = useNavigate()
  const { puede } = usePermisosSso('inspecciones')
  const { areas, nombreArea, nombreUsuario } = useDatosSso()
  const [lista, setLista] = useState<InspeccionV[]>([])
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [loading, setLoading] = useState(true)
  const [plantillaId, setPlantillaId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [meses, setMeses] = useState<number | null>(2)
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    Promise.all([listarInspecciones(), listarPlantillas()])
      .then(([i, p]) => {
        setLista(i)
        setPlantillas(p)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  const filtradas = useMemo(() => {
    const h = hoyChile()
    const desde = meses === null ? '0000-01-01' : new Date(Date.UTC(+h.slice(0, 4), +h.slice(5, 7) - 1 - meses, 1)).toISOString().slice(0, 10)
    return lista.filter((i) => i.fecha >= desde && (!plantillaId || i.checklist_id === plantillaId) && (!areaId || i.area_id === areaId))
  }, [lista, plantillaId, areaId, meses])

  const total = filtradas.reduce((s, i) => ({ cumple: s.cumple + i.cumple, no_cumple: s.no_cumple + i.no_cumple }), { cumple: 0, no_cumple: 0 })
  const pct = cumplimiento(total)

  async function exportar() {
    setExportando(true)
    try {
      exportarInspeccionesExcel(filtradas, await listarRespuestas(filtradas.map((i) => i.id)), nombreArea)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo exportar')
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {filtradas.length} inspecciones · cumplimiento {pct === null ? '—' : `${pct}%`} · {filtradas.reduce((s, i) => s + Number(i.hallazgos), 0)} hallazgos generados
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_180px_auto]">
        <select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)} className={selectClase} aria-label="Plantilla">
          <option value="">Todas las plantillas</option>
          {plantillas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={selectClase} aria-label="Área">
          <option value="">Todas las áreas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        <select value={meses ?? ''} onChange={(e) => setMeses(e.target.value === '' ? null : Number(e.target.value))} className={selectClase} aria-label="Período">
          <option value="0">Este mes</option>
          <option value="2">Últimos 3 meses</option>
          <option value="11">Últimos 12 meses</option>
          <option value="">Todo</option>
        </select>
        {puede('exportar') && (
          <Button variant="outline" onClick={exportar} disabled={exportando || filtradas.length === 0}>
            <FileSpreadsheet className="mr-1 h-4 w-4" /> {exportando ? 'Exportando…' : 'Excel'}
          </Button>
        )}
      </div>
      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : filtradas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{lista.length === 0 ? 'Todavía no hay inspecciones.' : 'Ninguna inspección coincide con los filtros.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Plantilla</TableHead>
                  <TableHead>Área / ubicación</TableHead>
                  <TableHead>Inspector</TableHead>
                  <TableHead className="text-right">Cumplimiento</TableHead>
                  <TableHead className="text-right">Hallazgos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((i) => {
                  const p = cumplimiento(i)
                  return (
                    <TableRow key={i.id} className="cursor-pointer" onClick={() => navigate(RUTA.inspeccion(i.id))}>
                      <TableCell className="whitespace-nowrap">{fmtFecha(i.fecha)}</TableCell>
                      <TableCell className="font-medium">{i.checklist}</TableCell>
                      <TableCell>
                        <p>{i.area_id ? nombreArea(i.area_id) : 'General'}</p>
                        {i.ubicacion && <p className="text-xs text-muted-foreground">{i.ubicacion}</p>}
                      </TableCell>
                      <TableCell>{nombreUsuario(i.inspector)}</TableCell>
                      <TableCell className={cn('text-right font-mono-tabular', p !== null && p < 100 && 'font-semibold text-red-700 dark:text-red-400')}>
                        {p === null ? '—' : `${p}%`}
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          {i.no_cumple} no cumple{i.no_cumple === 1 ? '' : 'n'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono-tabular">{i.hallazgos}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
