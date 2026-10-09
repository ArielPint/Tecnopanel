// Orden de prioridad de aterrizaje en un proyecto: el primer módulo al que el usuario tenga acceso
// real (módulo habilitado en el proyecto + permiso). 'dashboard' no se asume por defecto: un usuario
// con solo 'solicitudes' rebotaba sin acceso (ver DashboardPlantaGate).
export const MODULOS_ATERRIZAJE: { modulo: string; ruta: string }[] = [
  { modulo: 'dashboard', ruta: 'dashboard' },
  { modulo: 'obra', ruta: 'obra' },
  { modulo: 'produccion', ruta: 'produccion' },
  { modulo: 'logistica', ruta: 'logistica' },
  { modulo: 'solicitudes', ruta: 'solicitudes' },
  { modulo: 'financiero', ruta: 'financiero' },
  { modulo: 'estados_pago', ruta: 'estados-pago' },
]
