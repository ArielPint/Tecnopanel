// Portal Adquisiciones: catálogos compartidos por las pantallas y por la pestaña de accesos de
// Usuarios. Los mismos valores están en la migración 20261016120000_adquisiciones.sql (checks de las
// tablas, adq_usuario_nivel): si cambia uno, cambia el otro.

/** Un rol por fila de permisos: modulo_key 'adq:<rol>', accion 'ver', sobre el ancla ADQ_ANCLA_ID. */
export type RolAdq = 'solicitante' | 'bodega' | 'comprador' | 'aprobador_1' | 'aprobador_2' | 'aprobador_3' | 'jefe_compras'

export const ROLES_ADQ: { key: RolAdq; label: string; detalle: string }[] = [
  { key: 'solicitante', label: 'Solicitante', detalle: 'Crea solicitudes de compra y sigue las suyas hasta que llegan.' },
  {
    key: 'bodega',
    label: 'Bodega',
    detalle: 'Ve la reposición de stock de la bodega de la sucursal (SAP B006 Santiago, B007 Puerto Varas), define los mínimos y crea las solicitudes de reposición.',
  },
  {
    key: 'comprador',
    label: 'Comprador',
    detalle: 'Cotiza, envía a aprobación y vincula la OC de SAP de las solicitudes de la sucursal. Ve sus OC de SAP, el dashboard y la reposición.',
  },
  { key: 'aprobador_1', label: 'Aprobador nivel 1', detalle: 'Aprueba el primer nivel (todas las compras pasan por aquí). Ve el dashboard de la sucursal.' },
  { key: 'aprobador_2', label: 'Aprobador nivel 2', detalle: 'Aprueba hasta el nivel 2, incluido el 1 si está pendiente.' },
  { key: 'aprobador_3', label: 'Aprobador nivel 3', detalle: 'Aprueba todos los niveles.' },
  {
    key: 'jefe_compras',
    label: 'Jefe de compras',
    detalle: 'Todo lo del comprador en la sucursal; configura sus niveles de aprobación y carga el presupuesto anual de sus centros de costo.',
  },
]

export type EstadoSolicitud = 'cotizando' | 'en_aprobacion' | 'aprobada' | 'oc_emitida' | 'recibida' | 'rechazada' | 'anulada'

export const ESTADO: Record<EstadoSolicitud, { label: string; variant: 'warning' | 'default' | 'success' | 'secondary' | 'destructive' }> = {
  cotizando: { label: 'En cotización', variant: 'warning' },
  en_aprobacion: { label: 'En aprobación', variant: 'default' },
  aprobada: { label: 'Aprobada', variant: 'success' },
  oc_emitida: { label: 'OC emitida', variant: 'default' },
  recibida: { label: 'Recibida', variant: 'success' },
  rechazada: { label: 'Rechazada', variant: 'destructive' },
  anulada: { label: 'Anulada', variant: 'secondary' },
}

export const ABIERTOS: EstadoSolicitud[] = ['cotizando', 'en_aprobacion', 'aprobada', 'oc_emitida']

/** Sugerencias; se puede escribir otra. */
export const AREAS = [
  'Producción',
  'Bodega',
  'Abastecimiento',
  'Logística y despacho',
  'Obras y montaje',
  'Ingeniería y proyectos',
  'Comercial',
  'Calidad',
  'Mantención',
  'TI',
  'Administración y finanzas',
  'Prevención de riesgos',
  'Gerencia',
]

export const UNIDADES = ['UN', 'KG', 'M', 'M2', 'M3', 'LT', 'CAJA', 'ROLLO', 'PAR', 'GL', 'HR', 'SERVICIO']
