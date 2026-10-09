import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Pencil, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  ARCHIVOS_ACEPTADOS,
  SITUACION_DOC,
  TIPO_DOCUMENTO,
  eliminarDocumento,
  eliminarVersion,
  errorArchivo,
  listarVersiones,
  obtenerDocumento,
  siguienteVersion,
  subirVersion,
  type DocumentoV,
  type Version,
} from '../lib/apiDocumentos'
import { fmtFecha, hoyChile } from '../lib/estados'
import { RUTA } from '../lib/rutas'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'
import { descargar } from './Documentos'

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm">{children || '—'}</div>
    </div>
  )
}

export default function Documento() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede, userId } = usePermisosSso('documentos')
  const { nombreArea, nombreUsuario } = useDatosSso()
  const [d, setD] = useState<DocumentoV | null>(null)
  const [versiones, setVersiones] = useState<Version[]>([])
  const [loading, setLoading] = useState(true)
  const [nueva, setNueva] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [doc, vs] = await Promise.all([obtenerDocumento(id), listarVersiones(id)])
      setD(doc)
      setVersiones(vs)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />
  if (!d) {
    return (
      <div className="space-y-3">
        <Link to={RUTA.documentos} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a documentos
        </Link>
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">El documento no existe o no tienes acceso.</p>
      </div>
    )
  }
  const doc = d
  const puedeEditar = puede('editar') || (doc.creado_por === userId && puede('crear'))

  async function borrarVersion(v: Version) {
    if (!window.confirm(`¿Eliminar la versión ${v.version}? Si es la vigente, pasa a regir la anterior.`)) return
    try {
      await eliminarVersion(v)
      toast.success('Versión eliminada')
      cargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  async function borrar() {
    if (!window.confirm(`¿Eliminar ${doc.codigo} con todas sus versiones? Lo normal es marcarlo como obsoleto.`)) return
    try {
      await eliminarDocumento(doc.id, versiones)
      toast.success('Documento eliminado')
      navigate(RUTA.documentos, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <div className="space-y-4">
      <Link to={RUTA.documentos} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a documentos
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold">
            <span className="font-mono-tabular">{doc.codigo}</span> · {doc.titulo}
          </h1>
          <p className="text-sm text-muted-foreground">
            {TIPO_DOCUMENTO[doc.tipo]}
            {!doc.activo && ' · obsoleto'}
          </p>
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', SITUACION_DOC[doc.situacion].clase)}>{SITUACION_DOC[doc.situacion].label}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {doc.archivo_path && (
            <Button size="sm" onClick={() => descargar(doc.archivo_path!, doc.archivo_nombre!)}>
              <Download className="mr-1 h-4 w-4" /> Descargar vigente
            </Button>
          )}
          {puede('crear') && (
            <Button size="sm" variant="outline" onClick={() => setNueva(true)}>
              <Upload className="mr-1 h-4 w-4" /> Nueva versión
            </Button>
          )}
          {puedeEditar && (
            <Button size="sm" variant="outline" onClick={() => navigate(RUTA.editarDocumento(doc.id))}>
              <Pencil className="mr-1 h-4 w-4" /> Editar
            </Button>
          )}
          {puede('eliminar') && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={borrar}>
              <Trash2 className="mr-1 h-4 w-4" /> Eliminar
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-4">
          <Dato label="Versión vigente">{doc.version && `${doc.version} · ${fmtFecha(doc.fecha_emision)}`}</Dato>
          <Dato label="Vigente hasta">{doc.vigente_hasta ? fmtFecha(doc.vigente_hasta) : doc.version ? 'Sin vencimiento' : null}</Dato>
          <Dato label="Área">{doc.area_id ? nombreArea(doc.area_id) : 'Toda la empresa'}</Dato>
          <Dato label="Responsable">{doc.responsable_user_id && nombreUsuario(doc.responsable_user_id)}</Dato>
          <Dato label="Revisión">{doc.revision_meses ? `Cada ${doc.revision_meses} meses` : 'Sin vencimiento'}</Dato>
          {doc.descripcion && (
            <div className="sm:col-span-3">
              <Dato label="Descripción / alcance">
                <p className="whitespace-pre-wrap">{doc.descripcion}</p>
              </Dato>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <p className="mb-2 text-sm font-bold">Historial de versiones</p>
          {versiones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin versiones. Sube el primer archivo con "Nueva versión".</p>
          ) : (
            <ul className="divide-y">
              {versiones.map((v, i) => (
                <li key={v.id} className={cn('flex flex-wrap items-center gap-3 py-2 text-sm', i > 0 && 'text-muted-foreground')}>
                  <span className="w-16 font-mono-tabular font-semibold">v{v.version}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      Emitida {fmtFecha(v.fecha_emision)}
                      {v.vigente_hasta && ` · vigente hasta ${fmtFecha(v.vigente_hasta)}`}
                      {i === 0 && <span className="ml-2 rounded-full bg-primary/10 px-2 text-[11px] font-semibold text-primary">vigente</span>}
                    </span>
                    {v.cambios && <span className="block text-xs">{v.cambios}</span>}
                    <span className="block text-xs">
                      {v.aprobado_por && `Aprobó ${v.aprobado_por} · `}subió {nombreUsuario(v.subido_por)}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => descargar(v.archivo_path, v.archivo_nombre)} title={v.archivo_nombre}>
                    <Download className="mr-1 h-4 w-4" /> {v.archivo_nombre.length > 28 ? `${v.archivo_nombre.slice(0, 25)}…` : v.archivo_nombre}
                  </Button>
                  {puede('editar') && (
                    <Button size="icon" variant="ghost" onClick={() => borrarVersion(v)} title="Eliminar versión">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <DialogVersion open={nueva} onOpenChange={setNueva} documento={doc} onGuardado={cargar} />
    </div>
  )
}

function DialogVersion({ open, onOpenChange, documento, onGuardado }: { open: boolean; onOpenChange: (v: boolean) => void; documento: DocumentoV; onGuardado: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [version, setVersion] = useState('')
  const [emision, setEmision] = useState(hoyChile())
  const [vigente, setVigente] = useState('')
  const [cambios, setCambios] = useState('')
  const [aprobado, setAprobado] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!open) return
    setArchivo(null)
    setVersion(siguienteVersion(documento.version))
    setEmision(hoyChile())
    setVigente('')
    setCambios('')
    setAprobado('')
  }, [open, documento.version])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!archivo) {
      toast.error('Elige el archivo')
      return
    }
    const err = errorArchivo(archivo)
    if (err) {
      toast.error(err)
      return
    }
    setEnviando(true)
    try {
      await subirVersion(
        documento.id,
        { version: version.trim(), fecha_emision: emision, vigente_hasta: vigente || null, cambios: cambios.trim() || null, aprobado_por: aprobado.trim() || null },
        archivo,
      )
      toast.success(`Versión ${version} subida`)
      onGuardado()
      onOpenChange(false)
    } catch (er) {
      toast.error(er instanceof Error ? er.message : 'No se pudo subir')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva versión de {documento.codigo}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Input type="file" accept={ARCHIVOS_ACEPTADOS.join(',')} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-ver">Versión *</Label>
              <Input id="v-ver" value={version} onChange={(e) => setVersion(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-emi">Emisión *</Label>
              <Input id="v-emi" type="date" value={emision} max={hoyChile()} onChange={(e) => setEmision(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="v-vig">Vigente hasta</Label>
              <Input id="v-vig" type="date" value={vigente} min={emision} onChange={(e) => setVigente(e.target.value)} />
            </div>
          </div>
          <p className="-mt-1 text-[11px] text-muted-foreground">
            {documento.revision_meses ? `Sin fecha: emisión + ${documento.revision_meses} meses.` : 'Sin fecha: no vence.'}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="v-cam">Qué cambió</Label>
            <Textarea id="v-cam" rows={2} value={cambios} onChange={(e) => setCambios(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="v-apr">Aprobado por</Label>
            <Input id="v-apr" value={aprobado} onChange={(e) => setAprobado(e.target.value)} placeholder="Nombre y cargo" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Subiendo…' : 'Subir versión'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
