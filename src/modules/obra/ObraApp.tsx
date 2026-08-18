import { useParams } from 'react-router-dom'
import PortalShell from '@/modules/financiero/components/PortalShell'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'
import ObraLayout from './pages/ObraLayout'

export default function ObraApp() {
  const { proyectoSlug = '' } = useParams<{ proyectoSlug: string }>()
  const acceso = usePermisosProyecto(proyectoSlug)

  if (acceso.loading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    )
  }

  if (!acceso.tieneAccion('obra')) {
    return (
      <div className="flex min-h-svh items-center justify-center text-center text-sm text-muted-foreground">
        No tienes acceso a Avance Obra.
      </div>
    )
  }

  return (
    <PortalShell actual="obra">
      <ObraLayout />
    </PortalShell>
  )
}
