import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSpreadsheet, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { cn } from '@/lib/utils'
import { ESTADO_EVENTO, TIPOS_EVENTO, TIPO_EVENTO, exportarEventosExcel, listarEventos, type EventoV } from '../lib/apiAccidentes'
import { listarTrabajadores } from '../lib/apiTrabajadores'
import { fmtFecha, hoyChile } from '../lib/estados'
import { RUTA } from '../lib/rutas'
import type { TrabajadorV } from '../lib/tiposTrabajadores'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'
import { useCatalogosTrabajadores } from '../hooks/useCatalogosTrabajadores'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

export function GravedadBadge({ gravedad }: { gravedad: string }) {
  if (gravedad === 'leve') return null
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold uppercase', gravedad === 'fatal' ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-red-600 text-white')}>
      {gravedad}
    </span>
  )
}

/** Registro de accidentes e incidentes. */
export default function Eventos() {
  const navigate = useNavigate()
  const { puede } = usePermisosSso('accidentes')
  const { nombreArea } = useDatosSso()
  const { empresas } = useCatalogosTrabajadores()
  const [eventos, setEventos] = useState<EventoV[]>([])
  const [trabajadores, setTrabajadores] = useState<TrabajadorV[]>([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('')
  const [empresaId, setEmpresaId] = useState('')
  const [estado, setEstado] = useState('')
  const [meses, setMeses] = useState<number | null>(11)

  useEffect(() => {
    Promise.all([listarEventos(), listarTrabajadores()])
      .then(([e, t]) => {
        setEventos(e)
        setTrabajadores(t)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  const trab = useMemo(() => new Map(trabajadores.map((t) => [t.id, t])), [trabajadores])
  const nombreTrabajador = (id: string | null) => {
    const t = id ? trab.get(id) : undefined
    return t ? `${t.apellidos}, ${t.nombres}` : ''
  }

  const filtrados = useMemo(() => {
    const h = hoyChile()
    const desde = meses === null ? '0000-01-01' : new Date(Date.UTC(+h.slice(0, 4), +h.slice(5, 7) - 1 - meses, 1)).toISOString().slice(0, 10)
    const q = texto.trim().toLowerCase()
    return eventos.filter((e) => {
      if (e.fecha < desde) return false
      if (tipo && e.tipo !== tipo) return false
      if (empresaId && e.empresa_id !== empresaId) return false
      if (estado && e.estado !== estado) return false
      if (!q) return true
      const t = e.trabajador_id ? trab.get(e.trabajador_id) : undefined
      return `${e.numero} ${e.descripcion} ${e.lugar ?? ''} ${t ? `${t.nombres} ${t.apellidos}` : ''}`.toLowerCase().includes(q)
    })
  }, [eventos, texto, tipo, empresaId, estado, meses, trab])

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_200px_180px_160px_150px_auto]">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="N°, descripción, lugar o afectado" value={texto} onChange={(e) => setTexto(e.target.value)} className="pl-8" />
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={selectClase} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {TIPOS_EVENTO.map((t) => (
            <option key={t.key} value={t.key}>
              {t.corto}
            </option>
          ))}
        </select>
        <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className={selectClase} aria-label="Empresa">
          <option value="">Todas las empresas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className={selectClase} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_EVENTO).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select value={meses ?? ''} onChange={(e) => setMeses(e.target.value === '' ? null : Number(e.target.value))} className={selectClase} aria-label="Período">
          <option value="2">Últimos 3 meses</option>
          <option value="11">Últimos 12 meses</option>
          <option value="">Todo</option>
        </select>
        {puede('exportar') && (
          <Button variant="outline" disabled={filtrados.length === 0} onClick={() => exportarEventosExcel(filtrados, { trabajador: nombreTrabajador, area: nombreArea })}>
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : filtrados.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{eventos.length === 0 ? 'No hay eventos registrados.' : 'Ningún evento coincide con los filtros.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">N°</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Afectado / empresa</TableHead>
                  <TableHead className="text-right">Días perdidos</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((e) => (
                  <TableRow key={e.id} className="cursor-pointer" onClick={() => navigate(RUTA.evento(e.id))}>
                    <TableCell className="font-mono-tabular font-semibold">{e.numero}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtFecha(e.fecha)}</TableCell>
                    <TableCell>
                      <span className="whitespace-nowrap">{TIPO_EVENTO[e.tipo].corto}</span> <GravedadBadge gravedad={e.gravedad} />
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="line-clamp-2">{e.descripcion}</p>
                      <p className="text-xs text-muted-foreground">{e.area_id ? nombreArea(e.area_id) : e.lugar ?? ''}</p>
                    </TableCell>
                    <TableCell>
                      <p>{nombreTrabajador(e.trabajador_id) || '—'}</p>
                      <p className="text-xs text-muted-foreground">{e.empresa}</p>
                    </TableCell>
                    <TableCell className="text-right font-mono-tabular">{e.dias_perdidos || ''}</TableCell>
                    <TableCell>
                      <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', ESTADO_EVENTO[e.estado].clase)}>{ESTADO_EVENTO[e.estado].label}</span>
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
