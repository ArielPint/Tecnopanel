import { useMemo } from 'react'
import { useObraCrData } from '../hooks/useObraCrData'
import { buildEntregasFlat } from '../lib/matrix'
import CalendarioEntregas from '../components/CalendarioEntregas'

export default function EntregaCliente() {
  const { modulos, loading, hayCR } = useObraCrData()
  const entregas = useMemo(() => buildEntregasFlat(modulos), [modulos])

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
  if (!hayCR) return <p className="py-10 text-center text-sm text-muted-foreground">Sin CR cargado todavía — subilo desde la pestaña Configuración.</p>

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Calendario armado a partir de las fechas de entrega cargadas por módulo y categoría en la pestaña Configuración.</p>
      <CalendarioEntregas entregas={entregas} emptyMessage="Ningún módulo tiene fecha de entrega cargada en Configuración." />
    </div>
  )
}
