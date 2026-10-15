import { AlertTriangle, ServerOff } from 'lucide-react'
import { formatFechaHora } from '@/modules/financiero/utils/formatters'
import { SinPortalError, type EstadoSync } from '../lib/api'

export function Cargando() {
  return (
    <div className="space-y-2 rounded-lg border bg-card p-4">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-6 animate-pulse rounded bg-muted" />
      ))}
    </div>
  )
}

/** Error de carga. Si la base no tiene el portal (Supabase), lo dice en vez de mostrar el error técnico. */
export function Aviso({ error }: { error: Error }) {
  const sinPortal = error instanceof SinPortalError
  const Icono = sinPortal ? ServerOff : AlertTriangle
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-10 text-center">
      <Icono className="h-8 w-8 text-muted-foreground" />
      <p className="font-semibold">{sinPortal ? 'Disponible solo en el portal interno' : 'No se pudieron cargar los datos'}</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {sinPortal
          ? 'La contabilidad de SAP se sincroniza solo en el servidor de Tecnopanel. Entra desde portal.tecnopanel.cl.'
          : error.message}
      </p>
    </div>
  )
}

export function PieFuente({ estado, extra }: { estado: EstadoSync | null; extra?: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      Fuente: asientos contables de SAP Business One, sin asientos de cierre del ejercicio.
      {estado && ` Actualizado el ${formatFechaHora(estado.sincronizado_en)}`}
      {extra && ` · ${extra}`}
    </p>
  )
}
