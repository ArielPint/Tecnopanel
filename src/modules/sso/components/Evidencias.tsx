import { useEffect, useState } from 'react'
import { Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { agregarEvidencia, eliminarEvidencia } from '../lib/api'
import { fmtFechaHora } from '../lib/estados'
import { getSignedUrls } from '../services/storage'
import type { Evidencia, TipoEvidencia } from '../lib/tipos'
import { SelectorFotos } from './SelectorFotos'

interface Props {
  hallazgoId: string
  tipo: TipoEvidencia
  titulo: string
  evidencias: Evidencia[]
  userId: string
  puedeSubir: boolean
  puedeBorrar: (e: Evidencia) => boolean
  nombreUsuario: (id: string | null) => string
  onCambio: () => void
}

export function Evidencias({ hallazgoId, tipo, titulo, evidencias, userId, puedeSubir, puedeBorrar, nombreUsuario, onCambio }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [pendientes, setPendientes] = useState<File[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [ampliada, setAmpliada] = useState<string | null>(null)

  const paths = evidencias.map((e) => e.path).join('|')
  useEffect(() => {
    getSignedUrls(paths ? paths.split('|') : [])
      .then(setUrls)
      .catch(() => setUrls({}))
  }, [paths])

  async function subir() {
    setSubiendo(true)
    let ok = 0
    for (const f of pendientes) {
      try {
        await agregarEvidencia(hallazgoId, tipo, f, userId)
        ok++
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `No se pudo subir ${f.name}`)
      }
    }
    setSubiendo(false)
    setPendientes([])
    if (ok) toast.success(ok === 1 ? 'Foto agregada' : `${ok} fotos agregadas`)
    onCambio()
  }

  async function borrar(e: Evidencia) {
    if (!window.confirm('¿Eliminar esta foto?')) return
    try {
      await eliminarEvidencia(e)
      onCambio()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar la foto')
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">{titulo}</p>
      {evidencias.length === 0 && !puedeSubir && <p className="text-sm text-muted-foreground">Sin fotos.</p>}
      <div className="flex flex-wrap gap-2">
        {evidencias.map((e) => (
          <figure key={e.id} className="group relative w-28">
            <button type="button" onClick={() => setAmpliada(urls[e.path] ?? null)} className="block h-28 w-28 overflow-hidden rounded-md border bg-muted">
              {urls[e.path] && <img src={urls[e.path]} alt={e.nombre ?? ''} className="h-full w-full object-cover" loading="lazy" />}
            </button>
            <figcaption className="mt-0.5 truncate text-[10px] text-muted-foreground" title={`${nombreUsuario(e.subido_por)} · ${fmtFechaHora(e.created_at)}`}>
              {nombreUsuario(e.subido_por)} · {fmtFechaHora(e.created_at)}
            </figcaption>
            {puedeBorrar(e) && (
              <button
                type="button"
                onClick={() => borrar(e)}
                className="absolute right-1 top-1 hidden rounded-full bg-black/60 p-1 text-white group-hover:block"
                aria-label="Eliminar foto"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </figure>
        ))}
      </div>
      {puedeSubir && (
        <div className="space-y-2">
          <SelectorFotos archivos={pendientes} onChange={setPendientes} disabled={subiendo} />
          {pendientes.length > 0 && (
            <Button type="button" size="sm" onClick={subir} disabled={subiendo}>
              <Upload className="mr-1 h-4 w-4" />
              {subiendo ? 'Subiendo…' : `Subir ${pendientes.length} ${pendientes.length === 1 ? 'foto' : 'fotos'}`}
            </Button>
          )}
        </div>
      )}
      {ampliada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setAmpliada(null)}>
          <img src={ampliada} alt="" className="max-h-full max-w-full rounded-md" />
        </div>
      )}
    </div>
  )
}
