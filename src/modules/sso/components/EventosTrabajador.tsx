import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { TIPO_EVENTO, listarEventos, type EventoV } from '../lib/apiAccidentes'
import { fmtFecha } from '../lib/estados'
import { RUTA } from '../lib/rutas'

/** Sección de la ficha del trabajador: accidentes e incidentes en que fue afectado o involucrado. */
export function EventosTrabajador({ trabajadorId }: { trabajadorId: string }) {
  const [eventos, setEventos] = useState<EventoV[]>([])
  const [listo, setListo] = useState(false)

  useEffect(() => {
    listarEventos(trabajadorId)
      .then(setEventos)
      .finally(() => setListo(true))
  }, [trabajadorId])

  const dias = eventos.reduce((s, e) => s + e.dias_perdidos, 0)

  return (
    <Card>
      <CardContent className="space-y-2 pt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">Accidentes e incidentes</p>
          {eventos.length > 0 && <p className="text-xs text-muted-foreground">{dias} días perdidos en total</p>}
        </div>
        {!listo ? (
          <div className="h-12 animate-pulse rounded bg-muted" />
        ) : eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin eventos registrados.</p>
        ) : (
          <ul className="divide-y">
            {eventos.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">{fmtFecha(e.fecha)}</span>
                <Link to={RUTA.evento(e.id)} className="min-w-0 flex-1 truncate hover:underline">
                  N° {e.numero} · {TIPO_EVENTO[e.tipo].corto}
                  {e.lesion && <span className="text-muted-foreground"> · {e.lesion}</span>}
                </Link>
                {e.dias_perdidos > 0 && <span className="text-xs text-muted-foreground">{e.dias_perdidos} días</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
