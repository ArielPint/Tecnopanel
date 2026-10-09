import { Building2, Factory, Handshake, HardHat, type LucideIcon } from 'lucide-react'
import { useAccesoUsuario } from '@/hooks/useAccesoUsuario'

// Accesos directos entre portales para quien no tiene el hub: admin o Gestión entran al hub y desde
// ahí a todo; los demás (p. ej. un proyecto + Producción SIP) no tienen hub al que volver, así que
// cada portal les muestra en su menú los otros portales que sí tienen.

export type PortalActual = { tipo: 'proyecto'; slug: string } | { tipo: 'crm' | 'sip' | 'sso' }

export interface OtroPortal {
  to: string
  label: string
  icon: LucideIcon
}

export function useOtrosPortales(actual: PortalActual): { conHub: boolean; portales: OtroPortal[] } {
  const acceso = useAccesoUsuario()
  if (acceso.loading) return { conHub: false, portales: [] }
  if (acceso.isAdmin || acceso.tieneGestion) return { conHub: true, portales: [] }

  const portales: OtroPortal[] = acceso.proyectosObra
    .filter((p) => !(actual.tipo === 'proyecto' && p.slug === actual.slug))
    // /proyectos/<slug> lleva al primer módulo con acceso (ver AterrizajeProyecto)
    .map((p) => ({ to: `/proyectos/${p.slug}`, label: p.nombre, icon: Building2 }))
  if (acceso.tieneSip && actual.tipo !== 'sip') portales.push({ to: '/produccion', label: 'Producción Paneles SIP', icon: Factory })
  if (acceso.tieneSso && actual.tipo !== 'sso') portales.push({ to: '/prevencion', label: 'Prevención de Riesgos', icon: HardHat })
  if (acceso.tieneCrm && actual.tipo !== 'crm') portales.push({ to: '/crm', label: 'CRM', icon: Handshake })
  return { conHub: false, portales }
}
