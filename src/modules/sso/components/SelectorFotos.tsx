import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { Button } from '@/modules/financiero/components/ui/button'

const TIPOS = ['image/jpeg', 'image/png', 'image/webp']

/** Fotos elegidas todavía sin subir, con vista previa. Sin `capture` a propósito: con él el celular
 *  abre solo la cámara; sin él ofrece cámara o galería (fotos tomadas antes en terreno). Con accept
 *  explícito en JPG/PNG/WebP, el iPhone entrega JPEG en vez de HEIC. */
export function SelectorFotos({ archivos, onChange, disabled }: { archivos: File[]; onChange: (f: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    const urls = archivos.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [archivos])

  function agregar(lista: FileList | null) {
    if (!lista) return
    const nuevos = Array.from(lista)
    const validos = nuevos.filter((f) => TIPOS.includes(f.type))
    setAviso(validos.length < nuevos.length ? 'Solo se aceptan fotos JPG, PNG o WebP.' : null)
    onChange([...archivos, ...validos])
    if (input.current) input.current.value = ''
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {previews.map((url, i) => (
          <div key={url} className="relative h-20 w-20 overflow-hidden rounded-md border">
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(archivos.filter((_, j) => j !== i))}
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
              aria-label="Quitar foto"
              disabled={disabled}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <Button type="button" variant="outline" className="h-20 w-20 flex-col gap-1 text-xs" onClick={() => input.current?.click()} disabled={disabled}>
          <Camera className="h-5 w-5" />
          Agregar
        </Button>
      </div>
      <input ref={input} type="file" accept={TIPOS.join(',')} multiple hidden onChange={(e) => agregar(e.target.files)} />
      {aviso && <p className="text-xs text-destructive">{aviso}</p>}
    </div>
  )
}
