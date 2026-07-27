import { useState } from 'react'
import { FileText } from 'lucide-react'
import { Button } from '@/modules/financiero/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import { getSignedUrl } from '@/modules/financiero/services/pdfStorage'

interface VisorPDFProps {
  pdfPath: string
}

export default function VisorPDF({ pdfPath }: VisorPDFProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onOpenChange = async (open: boolean) => {
    if (!open) {
      setUrl(null)
      return
    }
    try {
      setUrl(await getSignedUrl(pdfPath))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el enlace del PDF')
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Ver PDF">
          <FileText className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>PDF</DialogTitle>
        </DialogHeader>
        {error && <p className="text-destructive">{error}</p>}
        {!error && !url && <p className="text-muted-foreground">Generando enlace…</p>}
        {url && (
          <div className="flex flex-col gap-3">
            <iframe src={url} title="PDF" className="h-[70vh] w-full rounded-md border" />
            <Button asChild variant="outline">
              <a href={url} download>
                Descargar
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
