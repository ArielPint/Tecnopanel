// Portal Producción: un permiso por módulo, igual que el CRM y Prevención.
// En la base: permisos.modulo_key = 'pnl:<key>' sobre el ancla SIP_ANCLA_ID, accion ∈ acciones.
// Este catálogo lo usan el menú del portal y la pestaña "Producción" de Usuarios.

export type AccionSip = 'ver' | 'crear' | 'editar' | 'eliminar' | 'exportar'

export type ModuloSip = 'produccion' | 'cortes' | 'plan' | 'stock' | 'consumo' | 'recetas' | 'proyeccion'

export interface DefModulo {
  key: ModuloSip
  label: string
  grupo: 'Paneles SIP' | 'Proyección' | 'Configuración'
  ruta: string
  acciones: { key: AccionSip; label: string }[]
}

export const SIP_MODULOS: DefModulo[] = [
  {
    key: 'produccion',
    label: 'Registro de producción',
    grupo: 'Paneles SIP',
    ruta: '/produccion/registro',
    acciones: [
      { key: 'ver', label: 'Ver' },
      { key: 'crear', label: 'Registrar producción (y corregir sus propios registros)' },
      { key: 'editar', label: 'Corregir cualquier registro' },
      { key: 'exportar', label: 'Exportar a Excel' },
      { key: 'eliminar', label: 'Eliminar registros' },
    ],
  },
  {
    key: 'cortes',
    label: 'Cortes de paneles',
    grupo: 'Paneles SIP',
    ruta: '/produccion/cortes',
    acciones: [
      { key: 'ver', label: 'Ver cortes y avance de los proyectos de SAP' },
      { key: 'crear', label: 'Registrar cortes (y corregir sus propios registros)' },
      { key: 'editar', label: 'Corregir cualquier registro' },
      { key: 'exportar', label: 'Exportar a Excel' },
      { key: 'eliminar', label: 'Eliminar registros' },
    ],
  },
  {
    key: 'plan',
    label: 'Plan semanal',
    grupo: 'Paneles SIP',
    ruta: '/produccion/plan',
    acciones: [
      { key: 'ver', label: 'Ver plan vs real y los montos de las órdenes de venta de SAP' },
      { key: 'editar', label: 'Cargar el plan de cada semana' },
    ],
  },
  {
    key: 'stock',
    label: 'Stock de paneles',
    grupo: 'Paneles SIP',
    ruta: '/produccion/stock',
    acciones: [
      { key: 'ver', label: 'Ver' },
      { key: 'editar', label: 'Cargar el stock inicial' },
    ],
  },
  {
    key: 'consumo',
    label: 'Consumo de materiales',
    grupo: 'Paneles SIP',
    ruta: '/produccion/consumo',
    acciones: [
      { key: 'ver', label: 'Ver consumo por período y calculadora' },
      { key: 'exportar', label: 'Exportar a Excel' },
    ],
  },
  {
    key: 'proyeccion',
    label: 'Proyección mensual',
    grupo: 'Proyección',
    ruta: '/produccion/proyeccion',
    acciones: [
      { key: 'ver', label: 'Ver el resumen por línea de negocio (proyectado, producido y facturado)' },
      { key: 'crear', label: 'Registrar lo producido cada semana (y corregir sus propios registros)' },
      { key: 'editar', label: 'Cargar la proyección del mes, los días hábiles y las medidas; corregir cualquier registro' },
      { key: 'exportar', label: 'Exportar a Excel' },
    ],
  },
  {
    key: 'recetas',
    label: 'Paneles y recetas',
    grupo: 'Configuración',
    ruta: '/produccion/recetas',
    acciones: [
      { key: 'ver', label: 'Ver' },
      { key: 'editar', label: 'Editar paneles, materiales, recetas y proyectos; importar el Excel de SAP' },
    ],
  },
]

export const GRUPOS_MENU = ['Paneles SIP', 'Proyección', 'Configuración'] as const

/** Clave del formulario de accesos: '<modulo>:<accion>' (en la base va con prefijo 'pnl:'). */
export const claveAcceso = (modulo: ModuloSip, accion: AccionSip) => `${modulo}:${accion}`

/** Cualquier acción de un módulo implica su 'ver': sin ella la RLS no deja leer nada de ese módulo. */
export function normalizarAccionesSip(acciones: Record<string, boolean>): Record<string, boolean> {
  const salida = { ...acciones }
  for (const m of SIP_MODULOS) {
    if (m.acciones.some((a) => a.key !== 'ver' && salida[claveAcceso(m.key, a.key)])) salida[claveAcceso(m.key, 'ver')] = true
  }
  return salida
}
