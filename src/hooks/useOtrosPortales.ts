import { Building2, Factory, FileCheck2, Handshake, HardHat, Landmark, ShoppingCart, UserPlus, type LucideIcon } from 'lucide-react'
import { useAccesoUsuario } from '@/hooks/useAccesoUsuario'

// Accesos directos entre portales para quien no tiene el hub: admin o Gestión entran al hub y desde
// ahí a todo; los demás (p. ej. un proyecto + Producción SIP) no tienen hub al que volver, así que
// cada portal les muestra en su menú los otros portales que sí tienen.

export type PortalActual = { tipo: 'proyecto'; slug: string } | { tipo: 'crm' | 'sip' | 'sso' | 'personal' | 'adquisiciones' | 'financiero' | 'contratistas' }

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
  if (acceso.tieneSip && actual.tipo !== 'sip') portales.push({ to: '/produccion', label: 'Producción', icon: Factory })
  if (acceso.tieneSso && actual.tipo !== 'sso') portales.push({ to: '/prevencion', label: 'Prevención de Riesgos', icon: HardHat })
  if (acceso.tieneIngreso && actual.tipo !== 'personal') portales.push({ to: '/personal', label: 'Ingreso de Personal', icon: UserPlus })
  if (acceso.tieneAdquisiciones && actual.tipo !== 'adquisiciones') portales.push({ to: '/adquisiciones', label: 'Adquisiciones', icon: ShoppingCart })
  if (acceso.tieneFinanciero && actual.tipo !== 'financiero') portales.push({ to: '/financiero', label: 'Financiero', icon: Landmark })
  if (acceso.tieneCrm && actual.tipo !== 'crm') portales.push({ to: '/crm', label: 'CRM', icon: Handshake })
  if (acceso.tieneContratista && actual.tipo !== 'contratistas') portales.push({ to: '/contratistas', label: 'Mi empresa (contratista)', icon: FileCheck2 })
  return { conHub: false, portales }
}
