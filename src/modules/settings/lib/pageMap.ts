// Mapa de páginas/pestañas del hub gateadas por user_profiles.permissions.pages.<id>.{access,tabs[]}.
// Solo incluye módulos que hoy consumen ese permiso (ver useAuth.tsx de cada módulo) — crm y planta
// quedan afuera porque usan `profiles` propia o no llegaron a esta fase (layout/producción/geovictoria).
export type PageId = 'financiero' | 'dashboard' | 'logistica' | 'solicitudes'

export interface PageDef {
  label: string
  restricted?: boolean
  tabs: Record<string, string>
}

export const PAGE_MAP: Record<PageId, PageDef> = {
  // ponytail: la clave real es 'dashboard' (coincide con planta/hooks/useAuth.tsx,
  // que es lo que gatea de verdad, y con la ruta /proyectos/la-chacra/dashboard) —
  // antes decía 'planta' acá y el toggle de Admin para este módulo nunca hacía nada.
  dashboard: {
    label: 'Dashboard Planta',
    tabs: {
      resumen: 'Resumen',
      curva: 'Curva',
      modulos: 'Módulos',
      compras: 'Compras',
      productos: 'Productos',
      stock: 'Stock',
      despachos: 'Despachos',
      proyeccion: 'Proyección',
      'prod-diaria': 'Prod. diaria',
      ejecutivo: 'Ejecutivo',
    },
  },
  logistica: {
    label: 'Logística',
    tabs: {
      'despacho-gd': 'Despacho GD',
      'registro-gd': 'Registro GD',
      'stock-ingreso': 'Stock Ingreso',
      pedidos: 'Pedidos',
    },
  },
  solicitudes: {
    label: 'Solicitudes de Materiales',
    tabs: {
      nueva: 'Nueva Solicitud',
      historial: 'Historial',
    },
  },
  financiero: {
    label: 'Financiero',
    restricted: true,
    tabs: {
      dashboard: 'Dashboard',
      'ordenes-compra': 'Órdenes de Compra',
      facturas: 'Facturas',
      presupuestos: 'Presupuestos',
      forecast: 'Forecast',
      remuneraciones: 'Remuneraciones',
      ingresos: 'Ingreso del Proyecto',
      'gastos-directos': 'Gastos Directos',
      auditoria: 'Auditoría',
    },
  },
}

// Pestañas de Financiero con edición propia — un mismo flag habilita edición
// en varias pestañas relacionadas (permiso_financiero_<key> en permissions).
export const FINANCIERO_EDIT_GROUPS: { key: string; label: string; tabs: string[] }[] = [
  { key: 'oc', label: 'Puede editar Órdenes de Compra y Facturas', tabs: ['ordenes-compra', 'facturas'] },
  { key: 'presupuestos', label: 'Puede editar Presupuestos y Forecast', tabs: ['presupuestos', 'forecast'] },
  { key: 'remuneraciones', label: 'Puede editar Remuneraciones', tabs: ['remuneraciones'] },
  { key: 'ingresos', label: 'Puede editar Ingreso del Proyecto', tabs: ['ingresos'] },
  { key: 'gastos-directos', label: 'Puede editar Gastos Directos', tabs: ['gastos-directos'] },
]

// 'readonly' es un valor de role literal (no un flag aparte) — logistica lo chequea
// directo como perfil.role !== 'readonly'. Se ofrece acá como una opción más de rol.
export const ROLES: { value: string; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'operador', label: 'Operador' },
  { value: 'viewer', label: 'Solo Lectura' },
  { value: 'editor', label: 'Editor' },
  { value: 'compras', label: 'Compras' },
  { value: 'readonly', label: 'Readonly (bloquea edición en Logística)' },
]

export type PagePerms = Record<string, { access: boolean; tabs: string[] }>

export function defaultPagePerms(): PagePerms {
  const result: PagePerms = {}
  for (const [pid, def] of Object.entries(PAGE_MAP)) {
    const access = !def.restricted
    result[pid] = { access, tabs: access ? Object.keys(def.tabs) : [] }
  }
  return result
}
