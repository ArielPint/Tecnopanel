import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/modules/financiero/components/ui/alert'

export default function AlertaSobreepaso() {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" />
      <AlertTitle>Factura supera la OC</AlertTitle>
      <AlertDescription>
        El monto acumulado de facturas para esta línea de OC superó su neto.
      </AlertDescription>
    </Alert>
  )
}
