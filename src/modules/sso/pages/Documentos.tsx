import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, FileSpreadsheet, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { cn } from '@/lib/utils'
import {
  SITUACION_DOC,
  TIPOS_DOCUMENTO,
  TIPO_DOCUMENTO,
  exportarListadoMaestro,
  listarDocumentos,
  urlDocumento,
  type DocumentoV,
  type SituacionDocumento,
} from '../lib/apiDocumentos'
import { fmtFecha } from '../lib/estados'
import { RUTA } from '../lib/rutas'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

export async function descargar(path: string, nombre: string) {
  try {
    window.open(await urlDocumento(path, nombre), '_blank')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'No se pudo descargar')
  }
}

/** Listado maestro de documentos con su versión vigente. */
export default function Documentos() {
  const navigate = useNavigate()
  const { puede } = usePermisosSso('documentos')
  const { areas, nombreArea, nombreUsuario } = useDatosSso()
  const [docs, setDocs] = useState<DocumentoV[]>([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('')
  const [areaId, setAreaId] = useState('')
  const [situacion, setSituacion] = useState<SituacionDocumento | ''>('')
  const [inactivos, setInactivos] = useState(false)

  useEffect(() => {
    listarDocumentos()
      .then(setDocs)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  const activos = docs.filter((d) => d.activo)
  const n = (s: SituacionDocumento) => activos.filter((d) => d.situacion === s).length

  const filtrados = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return docs.filter(
      (d) =>
        (inactivos || d.activo) &&
        (!tipo || d.tipo === tipo) &&
        (!areaId || d.area_id === areaId) &&
        (!situacion || d.situacion === situacion) &&
        (!q || `${d.codigo} ${d.titulo} ${d.descripcion ?? ''}`.toLowerCase().includes(q)),
    )
  }, [docs, texto, tipo, areaId, situacion, inactivos])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold">Documentos</h1>
          <p className="text-sm text-muted-foreground">Listado maestro: procedimientos, matriz IPER, reglamento, HDS, planes de emergencia.</p>
        </div>
        <div className="flex gap-2">
          {puede('exportar') && (
            <Button size="sm" variant="outline" disabled={filtrados.length === 0} onClick={() => exportarListadoMaestro(filtrados, nombreArea, nombreUsuario)}>
              <FileSpreadsheet className="mr-1 h-4 w-4" /> Listado maestro
            </Button>
          )}
          {puede('crear') && (
            <Button asChild size="sm">
              <Link to={RUTA.nuevoDocumento}>
                <Plus className="mr-1 h-4 w-4" /> Nuevo documento
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['vencido', 'por_vencer', 'sin_version', 'vigente'] as SituacionDocumento[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSituacion(situacion === s ? '' : s)}
            className={cn('rounded-full border px-3 py-1 text-xs font-medium', situacion === s ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted')}
          >
            {SITUACION_DOC[s].label} <span className="ml-1 opacity-70">{n(s)}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_240px_220px_auto]">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Código o título" value={texto} onChange={(e) => setTexto(e.target.value)} className="pl-8" />
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={selectClase} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {TIPOS_DOCUMENTO.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
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
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={inactivos} onCheckedChange={(v) => setInactivos(!!v)} /> Incluir obsoletos
        </label>
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : filtrados.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{docs.length === 0 ? 'Todavía no hay documentos.' : 'Ningún documento coincide con los filtros.'}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Versión</TableHead>
                  <TableHead>Vigente hasta</TableHead>
                  <TableHead>Situación</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((d) => (
                  <TableRow key={d.id} className={cn('cursor-pointer', !d.activo && 'opacity-60')} onClick={() => navigate(RUTA.documento(d.id))}>
                    <TableCell className="whitespace-nowrap font-mono-tabular font-semibold">{d.codigo}</TableCell>
                    <TableCell>
                      <p className="font-medium">
                        {d.titulo}
                        {!d.activo && ' (obsoleto)'}
                      </p>
                      <p className="text-xs text-muted-foreground">{TIPO_DOCUMENTO[d.tipo]}</p>
                    </TableCell>
                    <TableCell>{d.area_id ? nombreArea(d.area_id) : 'Toda la empresa'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {d.version ?? '—'}
                      {d.fecha_emision && <span className="block text-xs text-muted-foreground">{fmtFecha(d.fecha_emision)}</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{d.vigente_hasta ? fmtFecha(d.vigente_hasta) : d.version ? 'Sin vencimiento' : '—'}</TableCell>
                    <TableCell>
                      <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', SITUACION_DOC[d.situacion].clase)}>{SITUACION_DOC[d.situacion].label}</span>
                    </TableCell>
                    <TableCell>
                      {d.archivo_path && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title={`Descargar ${d.archivo_nombre}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            descargar(d.archivo_path!, d.archivo_nombre!)
                          }}
                        >
                          <Download className="h-4 w-4" />
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
