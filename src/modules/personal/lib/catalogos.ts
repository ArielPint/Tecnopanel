// Portal Ingreso de Personal: catálogos compartidos por las pantallas y por la pestaña de accesos
// de Usuarios. Los mismos valores están en la migración 20261015120000_ingreso_personal.sql
// (checks de las tablas, ing_catalogo_tareas, ing_docs_requeridos): si cambia uno, cambia el otro.

/** Un rol por fila de permisos: modulo_key 'ing:<rol>', accion 'ver', sobre el ancla ING_ANCLA_ID. */
export type RolIngreso = 'solicitante' | 'coordinador' | 'ti' | 'bodega' | 'prevencion' | 'rrhh'

export const ROLES_INGRESO: { key: RolIngreso; label: string; detalle: string }[] = [
  { key: 'solicitante', label: 'Solicitante', detalle: 'Crea solicitudes de ingreso para su área y sigue las suyas. Puede indicar la renta, pero después no la ve.' },
  {
    key: 'coordinador',
    label: 'Coordinador de sucursal',
    detalle: 'Recibe las solicitudes de su sucursal (la de la pestaña Cuenta; sin sucursal, las dos), carga los documentos del trabajador y completa tareas. No ve la renta.',
  },
  { key: 'ti', label: 'TI', detalle: 'Correo, accesos y equipo de los ingresos de su sucursal.' },
  { key: 'bodega', label: 'Bodega', detalle: 'Entrega de EPP y uniforme de los ingresos de su sucursal.' },
  { key: 'prevencion', label: 'Prevención', detalle: 'Inducción de seguridad de los ingresos de su sucursal.' },
  { key: 'rrhh', label: 'RRHH', detalle: 'Ve todos los ingresos, incluida la renta. Contrato, cierre con la ficha de BUK y anulación.' },
]

export type AreaTarea = 'rrhh' | 'ti' | 'bodega' | 'prevencion' | 'jefatura'

export const AREA_TAREA: Record<AreaTarea, string> = {
  rrhh: 'RRHH',
  ti: 'TI',
  bodega: 'Bodega',
  prevencion: 'Prevención',
  jefatura: 'Jefatura',
}

/** Lo que la solicitud puede pedir. Cada uno genera una tarea para el área indicada. */
export const REQUERIMIENTOS = [
  { key: 'req_ti', titulo: 'Correo, accesos y equipo', detalle: 'Cuenta de correo, usuario de sistemas, PC o notebook', area: 'TI' },
  { key: 'req_epp', titulo: 'Elementos de protección personal', detalle: 'Casco, zapatos de seguridad, guantes, lentes, protección auditiva', area: 'Bodega' },
  { key: 'req_uniforme', titulo: 'Uniforme', detalle: 'Ropa de trabajo según tallas', area: 'Bodega' },
  { key: 'req_induccion', titulo: 'Inducción de seguridad', detalle: 'Información de riesgos laborales del puesto', area: 'Prevención' },
  { key: 'req_vehiculo', titulo: 'Conducción de vehículos', detalle: 'Grúa horquilla, camión o vehículo de la empresa. Pide la licencia.', area: 'Jefatura que solicita' },
] as const

export type ClaveRequerimiento = (typeof REQUERIMIENTOS)[number]['key']

export type TipoDoc = 'cedula' | 'antecedentes' | 'afp' | 'salud' | 'estudios' | 'residencia' | 'licencia' | 'otro'

export const DOCUMENTOS: { key: TipoDoc; label: string }[] = [
  { key: 'cedula', label: 'Cédula de identidad (ambos lados)' },
  { key: 'antecedentes', label: 'Certificado de antecedentes' },
  { key: 'afp', label: 'Certificado de afiliación AFP' },
  { key: 'salud', label: 'Certificado Fonasa o Isapre' },
  { key: 'licencia', label: 'Licencia de conducir y hoja de vida del conductor' },
  { key: 'estudios', label: 'Certificado de estudios o título' },
  { key: 'residencia', label: 'Certificado de residencia' },
  { key: 'otro', label: 'Otros documentos' },
]

/** Sin estos no se puede cerrar el ingreso (igual que ing_docs_requeridos()). */
export function docsRequeridos(reqVehiculo: boolean): TipoDoc[] {
  return reqVehiculo ? ['cedula', 'antecedentes', 'afp', 'salud', 'licencia'] : ['cedula', 'antecedentes', 'afp', 'salud']
}

export type TipoContrato = 'plazo_fijo' | 'indefinido' | 'obra_faena'

export const TIPO_CONTRATO: Record<TipoContrato, string> = {
  plazo_fijo: 'Plazo fijo',
  indefinido: 'Indefinido',
  obra_faena: 'Por obra o faena',
}

/** Sugerencias; se puede escribir otra. */
export const AREAS_SOLICITANTES = [
  'Producción',
  'Bodega',
  'Abastecimiento',
  'Logística y despacho',
  'Obras y montaje',
  'Ingeniería y proyectos',
  'Comercial',
  'Calidad',
  'Mantención',
  'Administración y finanzas',
  'Prevención de riesgos',
  'Gerencia',
]

export const JORNADAS = ['Administrativa', 'Turno mañana', 'Turno tarde', 'Turno noche', 'Part time']

export type Situacion = 'en_proceso' | 'listo' | 'ingresado' | 'anulado'

export const SITUACION: Record<Situacion, { label: string; variant: 'warning' | 'default' | 'success' | 'secondary' }> = {
  en_proceso: { label: 'En proceso', variant: 'warning' },
  listo: { label: 'Listo para cerrar', variant: 'default' },
  ingresado: { label: 'Ingresado', variant: 'success' },
  anulado: { label: 'Anulado', variant: 'secondary' },
}
