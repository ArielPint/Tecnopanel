import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSpreadsheet, Paperclip, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { listarAsistentes, listarCapacitaciones, listarTiposCapacitacion, type CapacitacionV, type TipoCapacitacion } from '../lib/apiCapacitaciones'
import { listarTrabajadores } from '../lib/apiTrabajadores'
import { exportarCapacitacionesExcel } from '../lib/exportCapacitaciones'
import { fmtFecha, hoyChile } from '../lib/estados'
import { RUTA } from '../lib/rutas'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

type Periodo = 'mes' | '3m' | '12m' | 'todo'
const PERIODOS: { key: Periodo; label: string }[] = [
  { key: 'mes', label: 'Este mes' },
  { key: '3m', label: 'Últimos 3 meses' },
  { key: '12m', label: 'Últimos 12 meses' },
  { key: 'todo', label: 'Todo' },
]

function desdePeriodo(p: Periodo): string {
  const hoy = hoyChile()
  if (p === 'todo') return '0000-01-01'
  if (p === 'mes') return `${hoy.slice(0, 7)}-01`
  const meses = p === '3m' ? 2 : 11
  return new Date(Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1 - meses, 1)).toISOString().slice(0, 10)
}

function Tile({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <p className="mt-1 font-mono-tabular text-2xl font-extrabold">{valor}</p>
        {detalle && <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>}
      </CardContent>
    </Card>
  )
}

export default function Capacitaciones() {
  const navigate = useNavigate()
  const { puede } = usePermisosSso('capacitaciones')
  const { areas, nombreArea } = useDatosSso()
  const [caps, setCaps] = useState<CapacitacionV[]>([])
  const [tipos, setTipos] = useState<TipoCapacitacion[]>([])
  const [loading, setLoading] = useState(true)
  const [exportando, setExportando] = useState(false)

  const [periodo, setPeriodo] = useState<Periodo>('12m')
  const [tipoId, setTipoId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [texto, setTexto] = useState('')

  useEffect(() => {
    Promise.all([listarCapacitaciones(), listarTiposCapacitacion()])
      .then(([c, t]) => {
        setCaps(c)
        setTipos(t)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  const filtradas = useMemo(() => {
    const desde = desdePeriodo(periodo)
    const q = texto.trim().toLowerCase()
    return caps.filter(
      (c) =>
        c.fecha >= desde &&
        (!tipoId || c.tipo_id === tipoId) &&
        (!areaId || c.area_id === areaId) &&
        (!q || `${c.tema} ${c.relator} ${c.tipo}`.toLowerCase().includes(q)),
    )
  }, [caps, periodo, tipoId, areaId, texto])

  const hh = filtradas.reduce((s, c) => s + Number(c.horas_hombre), 0)
  const participaciones = filtradas.reduce((s, c) => s + c.asistentes, 0)
  const charlas = filtradas.filter((c) => c.tipo.toLowerCase().includes('charla')).length
  const sinEvidencia = filtradas.filter((c) => !c.evidencia_path).length

  async function exportar() {
    setExportando(true)
    try {
      const [asis, trab] = await Promise.all([listarAsistentes(), listarTrabajadores()])
      exportarCapacitacionesExcel(filtradas, asis, trab, nombreArea)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo exportar')
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile titulo="Capacitaciones" valor={String(filtradas.length)} detalle={`${charlas} charlas de 5 minutos`} />
        <Tile titulo="Horas-hombre" valor={hh.toLocaleString('es-CL', { maximumFractionDigits: 1 })} detalle="Duración × asistentes" />
        <Tile titulo="Participaciones" valor={String(participaciones)} detalle="Asistencias registradas" />
        <Tile titulo="Sin lista firmada" valor={String(sinEvidencia)} detalle="Falta adjuntar la evidencia" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_180px_200px_200px_auto]">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar tema o relator" value={texto} onChange={(e) => setTexto(e.target.value)} className="pl-8" />
        </div>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} className={selectClase} aria-label="Período">
          {PERIODOS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <select value={tipoId} onChange={(e) => setTipoId(e.target.value)} className={selectClase} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
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
            <p className="py-8 text-center text-sm text-muted-foreground">
              {caps.length === 0 ? 'Todavía no hay capacitaciones registradas.' : 'Ninguna capacitación coincide con los filtros.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo / tema</TableHead>
                  <TableHead>Relator</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead className="text-right">Asistentes</TableHead>
                  <TableHead className="text-right">HH</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(RUTA.capacitacion(c.id))}>
                    <TableCell className="whitespace-nowrap">{fmtFecha(c.fecha)}</TableCell>
                    <TableCell>
                      <p className="font-medium">{c.tema}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.tipo} · {c.duracion_min} min
                      </p>
                    </TableCell>
                    <TableCell>{c.relator}</TableCell>
                    <TableCell>{c.area_id ? nombreArea(c.area_id) : 'Toda la empresa'}</TableCell>
                    <TableCell className="text-right font-mono-tabular">
                      {c.asistentes}
                      {c.ausentes > 0 && <span className="text-xs text-muted-foreground"> (+{c.ausentes} aus.)</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono-tabular">{Number(c.horas_hombre).toLocaleString('es-CL')}</TableCell>
                    <TableCell>{c.evidencia_path && <Paperclip className="h-4 w-4 text-muted-foreground" aria-label="Con lista firmada" />}</TableCell>
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
