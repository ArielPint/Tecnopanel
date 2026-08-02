import { useParams } from 'react-router-dom'
import PortalShell from '@/modules/financiero/components/PortalShell'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'
import ProduccionLayout from './pages/ProduccionLayout'

export default function ProduccionApp() {
  const { proyectoSlug = '' } = useParams<{ proyectoSlug: string }>()
  const acceso = usePermisosProyecto(proyectoSlug)

  if (acceso.loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    )
  }

  if (!acceso.tieneAccion('produccion')) {
    return (
      <div className="flex min-h-svh items-center justify-center text-center text-sm text-muted-foreground">
        No tienes acceso a Producción.
      </div>
    )
  }

  return (
    <PortalShell actual="produccion">
      <ProduccionLayout />
    </PortalShell>
  )
}
