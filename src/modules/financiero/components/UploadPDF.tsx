import { useRef, useState } from 'react'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Button } from '@/modules/financiero/components/ui/button'
import { Label } from '@/modules/financiero/components/ui/label'

interface UploadPDFProps {
  tienePdfExistente: boolean
  onFileChange: (file: File | null) => void
}

// Reutilizado por FormularioOC y FormularioFactura — el PDF es opcional
// (checkbox "sin PDF"), la subida real la hace el formulario padre una vez
// que conoce el id del registro (ver src/services/pdfStorage.ts).
// Input nativo escondido + botón propio: el texto del <input type=file>
// nativo lo pone el idioma de la UI del navegador (no el Accept-Language de
// sitios), así que no respeta el idioma de la app — lo reemplazamos.
export default function UploadPDF({ tienePdfExistente, onFileChange }: UploadPDFProps) {
  const [sinPdf, setSinPdf] = useState(false)
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-1.5">
      <Label>PDF</Label>
      <div className="flex items-center gap-2">
        <Checkbox
          id="sin_pdf"
          checked={sinPdf}
          onCheckedChange={(checked) => {
            const value = checked === true
            setSinPdf(value)
            if (value) onFileChange(null)
          }}
        />
        <Label htmlFor="sin_pdf" className="font-normal text-muted-foreground">
          Sin PDF por ahora
        </Label>
      </div>
      {!sinPdf && (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              setNombreArchivo(file?.name ?? null)
              onFileChange(file)
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            Elegir archivo
          </Button>
          <span className="text-sm text-muted-foreground">{nombreArchivo ?? 'Sin archivo seleccionado'}</span>
        </div>
      )}
      {tienePdfExistente && !sinPdf && (
        <p className="text-xs text-muted-foreground">
          Si no elegís un archivo nuevo, se conserva el PDF ya cargado.
        </p>
      )}
    </div>
  )
}
