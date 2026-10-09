import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileSpreadsheet, Plus, Search } from 'lucide-react'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { cn } from '@/lib/utils'
import { listarHallazgos } from '../lib/api'
import { exportarHallazgosExcel } from '../lib/export'
import { ESTADOS, fmtFecha } from '../lib/estados'
import type { EstadoSso, Hallazgo } from '../lib/tipos'
import { EstadoBadge, VencidoBadge } from '../components/EstadoBadge'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { RUTA } from '../lib/rutas'
import { useDatosSso } from '../hooks/useDatosSso'

type FiltroEstado = EstadoSso | 'pendientes' | 'todos'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

export default function Hallazgos() {
  const navigate = useNavigate()
  const { puede, userId } = usePermisosSso('hallazgos')
  const { areas, usuarios, nombreUsuario, nombreArea } = useDatosSso()
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [estado, setEstado] = useState<FiltroEstado>('pendientes')
  const [areaId, setAreaId] = useState('')
  const [responsableId, setResponsableId] = useState('')
  const [soloVencidos, setSoloVencidos] = useState(false)
  const [soloMios, setSoloMios] = useState(false)
  const [texto, setTexto] = useState('')

  useEffect(() => {
    listarHallazgos()
      .then(setHallazgos)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar hallazgos'))
      .finally(() => setLoading(false))
  }, [])

  const conteo = useMemo(() => {
    const c: Record<string, number> = { pendientes: 0, todos: hallazgos.length }
    for (const h of hallazgos) {
      c[h.estado] = (c[h.estado] ?? 0) + 1
      if (h.estado !== 'cerrado') c.pendientes++
    }
    return c
  }, [hallazgos])

  const filtrados = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return hallazgos.filter((h) => {
      if (estado === 'pendientes' && h.estado === 'cerrado') return false
      if (estado !== 'pendientes' && estado !== 'todos' && h.estado !== estado) return false
      if (areaId && h.area_id !== areaId) return false
      if (responsableId && h.responsable_user_id !== responsableId) return false
      if (soloVencidos && !h.vencido) return false
      if (soloMios && h.responsable_user_id !== userId && h.reportado_por !== userId) return false
      if (q && !`${h.numero} ${h.ubicacion} ${h.descripcion}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [hallazgos, estado, areaId, responsableId, soloVencidos, soloMios, texto, userId])

  const chips: { key: FiltroEstado; label: string }[] = [
    { key: 'pendientes', label: 'Pendientes' },
    ...ESTADOS.map((e) => ({ key: e.key, label: e.label })),
    { key: 'todos', label: 'Todos' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setEstado(c.key)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              estado === c.key ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted',
            )}
          >
            {c.label} <span className="ml-1 opacity-70">{conteo[c.key] ?? 0}</span>
          </button>
        ))}
        <div className="ml-auto" />
        {puede('exportar') && (
          <Button
            size="sm"
            variant="outline"
            disabled={filtrados.length === 0}
            onClick={() => exportarHallazgosExcel(filtrados, nombreUsuario, nombreArea)}
            title="Exporta los hallazgos que se ven, con los filtros aplicados"
          >
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel ({filtrados.length})
          </Button>
        )}
        {puede('crear') && (
          <Button asChild size="sm">
            <Link to={RUTA.nuevoHallazgo}>
              <Plus className="mr-1 h-4 w-4" /> Reportar hallazgo
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar N°, ubicación o descripción" value={texto} onChange={(e) => setTexto(e.target.value)} className="pl-8" />
        </div>
        <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={selectClase}>
          <option value="">Todas las áreas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
              {a.activa ? '' : ' (inactiva)'}
            </option>
          ))}
        </select>
        <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className={selectClase}>
          <option value="">Todos los responsables</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre || u.email}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={soloVencidos} onCheckedChange={(v) => setSoloVencidos(!!v)} /> Solo vencidos
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={soloMios} onCheckedChange={(v) => setSoloMios(!!v)} /> Míos
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Error al cargar hallazgos: {error}
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : filtrados.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {hallazgos.length === 0 ? 'Todavía no hay hallazgos reportados.' : 'Ningún hallazgo coincide con los filtros.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">N°</TableHead>
                  <TableHead>Detección</TableHead>
                  <TableHead>Área / ubicación</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Plazo</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((h) => (
                  <TableRow key={h.id} className="cursor-pointer" onClick={() => navigate(RUTA.hallazgo(h.id))}>
                    <TableCell className="font-mono-tabular font-semibold">{h.numero}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtFecha(h.fecha_deteccion)}</TableCell>
                    <TableCell>
                      <p className="font-medium">{nombreArea(h.area_id)}</p>
                      <p className="text-xs text-muted-foreground">{h.ubicacion}</p>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="line-clamp-2">{h.descripcion}</p>
                    </TableCell>
                    <TableCell>{nombreUsuario(h.responsable_user_id)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <p>{fmtFecha(h.fecha_compromiso)}</p>
                      {h.vencido && <VencidoBadge dias={h.dias_atraso} />}
                    </TableCell>
                    <TableCell>
                      <EstadoBadge estado={h.estado} />
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
