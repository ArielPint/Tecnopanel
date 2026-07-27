import { MapPin } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

// GeoVictoria es una API de asistencia/personal ya integrada dentro de La
// Chacra (no un sitio externo aparte) — esta página consolidará esos datos
// en el hub cuando se implemente la sincronización (Fase 3).
export default function GeoVictoriaPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">GeoVictoria</h1>
        <p className="text-sm text-muted-foreground">Asistencia y personal — integración vía La Chacra.</p>
      </div>

      <Card>
        <CardContent className="flex items-start gap-4 pt-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-info/10 text-info">
            <MapPin className="h-6 w-6" />
          </div>
          <div>
            <p className="font-bold">Sin datos aún</p>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              GeoVictoria está integrado como API dentro de La Chacra. Consolidar esos datos acá es
              parte de la sincronización de KPIs (Fase 3), todavía no implementada.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
