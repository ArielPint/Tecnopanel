import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { ARCHIVOS_ACEPTADOS, TIPOS_DOCUMENTO, errorArchivo, guardarDocumento, obtenerDocumento, subirVersion, type DocumentoV, type FichaDocumento, type TipoDocumento } from '../lib/apiDocumentos'
import { hoyChile } from '../lib/estados'
import { RUTA } from '../lib/rutas'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

/** Alta (con su primera versión opcional) y edición de la ficha de un documento. */
export default function FormDocumento() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede, userId, loading: permisosLoading } = usePermisosSso('documentos')
  const { areas, usuarios } = useDatosSso()
  const [original, setOriginal] = useState<DocumentoV | null>(null)
  const [f, setF] = useState<FichaDocumento>({ codigo: '', titulo: '', tipo: 'procedimiento', area_id: null, responsable_user_id: null, revision_meses: 24, descripcion: null, activo: true })
  const [archivo, setArchivo] = useState<File | null>(null)
  const [version, setVersion] = useState('1')
  const [emision, setEmision] = useState(hoyChile())
  const [aprobado, setAprobado] = useState('')
  const [cargando, setCargando] = useState(!!id)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!id) return
    obtenerDocumento(id)
      .then((d) => {
        if (!d) return
        setOriginal(d)
        setF({ codigo: d.codigo, titulo: d.titulo, tipo: d.tipo, area_id: d.area_id, responsable_user_id: d.responsable_user_id, revision_meses: d.revision_meses, descripcion: d.descripcion, activo: d.activo })
      })
      .finally(() => setCargando(false))
  }, [id])

  const puedeGuardar = id ? puede('editar') || (original?.creado_por === userId && puede('crear')) : puede('crear')
  if (!permisosLoading && !cargando && !puedeGuardar) return <Navigate to={id ? RUTA.documento(id) : RUTA.documentos} replace />

  const set = <K extends keyof FichaDocumento>(k: K, v: FichaDocumento[K]) => setF((x) => ({ ...x, [k]: v }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!f.codigo.trim() || !f.titulo.trim()) {
      toast.error('Código y título son obligatorios')
      return
    }
    const err = archivo && errorArchivo(archivo)
    if (err) {
      toast.error(err)
      return
    }
    if (archivo && !version.trim()) {
      toast.error('Indica la versión del archivo')
      return
    }
    setEnviando(true)
    try {
      const docId = await guardarDocumento(id ?? null, { ...f, codigo: f.codigo.trim(), titulo: f.titulo.trim(), descripcion: f.descripcion?.trim() || null })
      if (archivo) {
        try {
          await subirVersion(docId, { version: version.trim(), fecha_emision: emision, vigente_hasta: null, cambios: 'Emisión inicial', aprobado_por: aprobado.trim() || null }, archivo)
        } catch (er) {
          toast.warning(`Documento guardado, pero el archivo no se pudo subir: ${er instanceof Error ? er.message : ''}`)
        }
      }
      toast.success(id ? 'Documento actualizado' : 'Documento creado')
      navigate(RUTA.documento(docId), { replace: true })
    } catch (er) {
      const m = er instanceof Error ? er.message : 'No se pudo guardar'
      toast.error(m.includes('duplicate') ? 'Ya existe un documento con ese código' : m)
      setEnviando(false)
    }
  }

  if (cargando) return <div className="h-40 animate-pulse rounded bg-muted" />

  return (
    <div className="space-y-4">
      <Link to={id ? RUTA.documento(id) : RUTA.documentos} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {id ? 'Volver al documento' : 'Volver a documentos'}
      </Link>
      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <h1 className="text-lg font-extrabold">{id ? 'Editar documento' : 'Nuevo documento'}</h1>
            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-cod">Código *</Label>
                <Input id="d-cod" value={f.codigo} onChange={(e) => set('codigo', e.target.value.toUpperCase())} placeholder="PTS-001" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-tit">Título *</Label>
                <Input id="d-tit" value={f.titulo} onChange={(e) => set('titulo', e.target.value)} required />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-tipo">Tipo</Label>
                <select id="d-tipo" value={f.tipo} onChange={(e) => set('tipo', e.target.value as TipoDocumento)} className={selectClase}>
                  {TIPOS_DOCUMENTO.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-area">Área</Label>
                <select id="d-area" value={f.area_id ?? ''} onChange={(e) => set('area_id', e.target.value || null)} className={selectClase}>
                  <option value="">Toda la empresa</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-resp">Responsable</Label>
                <select id="d-resp" value={f.responsable_user_id ?? ''} onChange={(e) => set('responsable_user_id', e.target.value || null)} className={selectClase}>
                  <option value="">Sin responsable</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre || u.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-rev">Revisión cada (meses)</Label>
                <Input
                  id="d-rev"
                  type="number"
                  min={1}
                  value={f.revision_meses ?? ''}
                  placeholder="Sin vencimiento"
                  onChange={(e) => set('revision_meses', e.target.value ? Math.max(1, Number(e.target.value)) : null)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d-desc">Descripción / alcance</Label>
              <Textarea id="d-desc" rows={2} value={f.descripcion ?? ''} onChange={(e) => set('descripcion', e.target.value || null)} />
            </div>
            {id && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={f.activo} onCheckedChange={(v) => set('activo', !!v)} /> Documento vigente (desmarcar = obsoleto; se conserva el historial)
              </label>
            )}
          </CardContent>
        </Card>

        {!id && (
          <Card>
            <CardContent className="space-y-3 pt-5">
              <p className="text-sm font-bold">Primera versión (opcional)</p>
              <Input type="file" accept={ARCHIVOS_ACEPTADOS.join(',')} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
              {archivo && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="d-ver">Versión</Label>
                    <Input id="d-ver" value={version} onChange={(e) => setVersion(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="d-emi">Fecha de emisión</Label>
                    <Input id="d-emi" type="date" value={emision} max={hoyChile()} onChange={(e) => setEmision(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="d-apr">Aprobado por</Label>
                    <Input id="d-apr" value={aprobado} onChange={(e) => setAprobado(e.target.value)} placeholder="Nombre y cargo" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : id ? 'Guardar cambios' : 'Crear documento'}
          </Button>
        </div>
      </form>
    </div>
  )
}
