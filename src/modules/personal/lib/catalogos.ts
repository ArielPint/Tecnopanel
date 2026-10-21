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
  { key: 'prevencion', label: 'Prevención', detalle: 'IRL (inducción de seguridad) de los ingresos de su sucursal.' },
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

/** Lo que la solicitud puede pedir. Cada uno genera una tarea para el área indicada. Las inducciones
 *  no se eligen: ver TAREAS_SIEMPRE (ing_tipos_ingreso() en la base). */
export const REQUERIMIENTOS = [
  { key: 'req_ti', titulo: 'Equipo computacional y accesos', detalle: 'Correo, notebook, pantalla, licencias y portales', area: 'TI' },
  { key: 'req_epp', titulo: 'Elementos de protección personal', detalle: 'Casco, zapatos de seguridad, guantes, lentes, protección auditiva', area: 'Bodega' },
  { key: 'req_uniforme', titulo: 'Uniforme', detalle: 'Ropa de trabajo según tallas', area: 'Bodega' },
  { key: 'req_vehiculo', titulo: 'Conducción de vehículos', detalle: 'Grúa horquilla, camión o vehículo de la empresa. Pide la licencia o certificación.', area: 'Jefatura que solicita' },
] as const

export type ClaveRequerimiento = (typeof REQUERIMIENTOS)[number]['key']

/** Tareas que se crean solas en todo ingreso (o en los de planta). */
export const TAREAS_SIEMPRE: { titulo: string; area: string; soloPlanta?: boolean }[] = [
  { titulo: 'Contrato y anexos', area: 'RRHH', soloPlanta: true },
  { titulo: 'IRL: informar riesgos laborales', area: 'Prevención' },
  { titulo: 'Inducción de bienvenida', area: 'RRHH', soloPlanta: true },
]

/** Qué necesita de TI. Basta uno para que se cree la tarea de TI. */
export const ITEMS_TI = [
  { key: 'ti_correo', label: 'Correo' },
  { key: 'ti_notebook', label: 'Notebook' },
  { key: 'ti_pantalla', label: 'Pantalla' },
] as const

/** Licencias de software (igual que ing_licencia_label()). */
export const LICENCIAS_TI = [
  { key: 'aec', label: 'Licencia AEC' },
  { key: 'autocad_lt', label: 'AutoCAD LT' },
  { key: 'autocad_full', label: 'AutoCAD Full' },
  { key: 'sap', label: 'Licencia SAP' },
] as const

/** Portales del hub a los que hay que darle acceso (igual que ing_portal_label()). */
export const PORTALES_TI = [
  { key: 'crm', label: 'CRM' },
  { key: 'proyectos', label: 'Proyectos' },
  { key: 'produccion', label: 'Producción' },
  { key: 'prevencion', label: 'Prevención' },
  { key: 'ingreso', label: 'Ingreso de Personal' },
  { key: 'adquisiciones', label: 'Adquisiciones' },
  { key: 'financiero', label: 'Financiero' },
  { key: 'gestion', label: 'Gestión' },
] as const

export type TipoTrabajador = 'planta' | 'contratista'

export const TIPO_TRABAJADOR: Record<TipoTrabajador, string> = {
  planta: 'Planta (Tecnopanel)',
  contratista: 'Contratista',
}

export type Motivo = 'reemplazo' | 'aumento_dotacion' | 'nuevo_cargo' | 'proyecto' | 'temporada' | 'otro'

/** Igual que ing_motivo_label() */
export const MOTIVOS: Record<Motivo, string> = {
  reemplazo: 'Reemplazo',
  aumento_dotacion: 'Aumento de dotación',
  nuevo_cargo: 'Cargo nuevo',
  proyecto: 'Proyecto u obra específica',
  temporada: 'Temporada o peak de producción',
  otro: 'Otro',
}

/** Sugerencias para la conducción; se puede escribir otra. */
export const LICENCIAS = [
  'Clase B (vehículo liviano)',
  'Clase A4 (camión de carga simple)',
  'Clase A5 (camión de carga articulado)',
  'Clase D (grúa horquilla y maquinaria)',
  'Certificación operador de grúa horquilla',
  'Certificación operador de plataforma elevadora',
  'Certificación operador de puente grúa',
]

/** Tallas por prenda, las que entrega Bodega a los operadores de Tecno Panel y Zobek. Zapato para EPP;
 *  polera, pantalón y polar para el uniforme. Una talla fuera de la lista va en "Otras tallas".
 *  (El polar se guarda en talla_chaqueta.) */
const LETRAS = ['S', 'M', 'L', 'XL']
export const TALLAS = {
  talla_zapato: { label: 'Zapato de seguridad', opciones: ['39', '40', '41', '42'], para: 'epp' },
  talla_polera: { label: 'Polera', opciones: LETRAS, para: 'uniforme' },
  talla_pantalon: { label: 'Pantalón', opciones: LETRAS, para: 'uniforme' },
  talla_chaqueta: { label: 'Polar', opciones: LETRAS, para: 'uniforme' },
} as const

export type CampoTalla = keyof typeof TALLAS

/** Días hábiles de anticipación que pide el procedimiento para la fecha de ingreso. */
export const DIAS_AVISO = 10

export type TipoDoc =
  | 'cedula'
  | 'antecedentes'
  | 'afp'
  | 'salud'
  | 'estudios'
  | 'residencia'
  | 'licencia'
  | 'contrato_empleador'
  | 'reglamento'
  | 'otro'

/** `solo`: el documento se ofrece solo para ese tipo de trabajador (si ya se cargó, se muestra igual). */
export const DOCUMENTOS: { key: TipoDoc; label: string; solo?: TipoTrabajador }[] = [
  { key: 'cedula', label: 'Cédula de identidad (ambos lados)' },
  { key: 'antecedentes', label: 'Certificado de antecedentes' },
  { key: 'afp', label: 'Certificado de afiliación AFP', solo: 'planta' },
  { key: 'salud', label: 'Certificado Fonasa o Isapre', solo: 'planta' },
  { key: 'contrato_empleador', label: 'Contrato de trabajo con la empresa contratista', solo: 'contratista' },
  { key: 'reglamento', label: 'Recepción del reglamento interno', solo: 'contratista' },
  { key: 'licencia', label: 'Licencia de conducir y hoja de vida del conductor' },
  { key: 'estudios', label: 'Certificado de estudios o título' },
  { key: 'residencia', label: 'Certificado de residencia' },
  { key: 'otro', label: 'Otros documentos' },
]

/** Sin estos no se puede cerrar el ingreso (igual que ing_docs_req()). */
export function docsRequeridos(reqVehiculo: boolean, tipo: TipoTrabajador): TipoDoc[] {
  const base: TipoDoc[] = tipo === 'contratista' ? ['cedula', 'contrato_empleador', 'reglamento'] : ['cedula', 'antecedentes', 'afp', 'salud']
  return reqVehiculo ? [...base, 'licencia'] : base
}

export type TipoContrato = 'plazo_fijo' | 'indefinido' | 'obra_faena'

export const TIPO_CONTRATO: Record<TipoContrato, string> = {
  plazo_fijo: 'Plazo fijo',
  indefinido: 'Indefinido',
  obra_faena: 'Por obra o faena',
}

export type Situacion = 'en_proceso' | 'listo' | 'ingresado' | 'anulado'

export const SITUACION: Record<Situacion, { label: string; variant: 'warning' | 'default' | 'success' | 'secondary' }> = {
  en_proceso: { label: 'En proceso', variant: 'warning' },
  listo: { label: 'Listo para cerrar', variant: 'default' },
  ingresado: { label: 'Ingresado', variant: 'success' },
  anulado: { label: 'Anulado', variant: 'secondary' },
}
