import { useComunicaciones } from '../hooks/useComunicaciones'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Badge } from '@/modules/financiero/components/ui/badge'

export default function Comunicaciones({ tieneCrm }: { tieneCrm: boolean }) {
  const { mensajes, loading, error } = useComunicaciones(tieneCrm)

  if (!tieneCrm) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Sin comunicaciones disponibles para tu acceso actual — Comunicaciones v1 solo cubre CRM.
      </p>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <p className="text-sm font-bold">Mensajes recientes (últimos 50, todas las oportunidades)</p>
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Error al cargar mensajes: {error}
          </div>
        )}
        {loading ? (
          <div className="h-24 animate-pulse rounded bg-muted" />
        ) : mensajes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin mensajes todavía.</p>
        ) : (
          <div className="space-y-2">
            {mensajes.map((m) => (
              <div key={m.id} className="rounded-md border p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Badge variant="outline">{m.oportunidad}</Badge>
                  <span className="text-[12px] text-muted-foreground">
                    {m.usuario} · {new Date(m.fecha).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                <p className="text-sm">{m.mensaje}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
