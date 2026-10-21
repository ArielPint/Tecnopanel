// Control de Contratistas: catálogos del portal interno y del portal de cada empresa (/contratistas).
// Los mismos valores están en las migraciones *_ingreso_personal_contratistas/validacion/control_contratistas.

/** Un rol por fila de permisos: modulo_key 'ctr:<rol>', accion 'ver', sobre el ancla CTR_ANCLA_ID. */
export type RolContratistas = 'consulta' | 'revisor_docs' | 'revisor_ep' | 'aprobador_ep' | 'administrador'

export const ROLES_CONTRATISTAS: { key: RolContratistas; label: string; detalle: string }[] = [
  { key: 'consulta', label: 'Consulta', detalle: 'Ve las empresas, su documentación, listados, trabajadores e ingresos. No valida.' },
  {
    key: 'revisor_docs',
    label: 'Revisor de documentación',
    detalle: 'Aprueba o rechaza la documentación mensual y el listado de trabajadores. Puede cargar documentos y confirmar el listado por la empresa.',
  },
  { key: 'revisor_ep', label: 'Revisor de estados de pago', detalle: 'Ve los estados de pago de todos los proyectos, los pasa a revisión o los rechaza.' },
  { key: 'aprobador_ep', label: 'Aprobador de estados de pago', detalle: 'Aprueba los estados de pago en revisión y registra su pago.' },
  { key: 'administrador', label: 'Administrador de empresas', detalle: 'Agrega y corrige empresas contratistas (la misma lista de Estados de Pago).' },
]

/** Documentos que cada empresa contratista sube todos los meses (igual que ing_empresa_doc_tipos()).
 *  El listado de trabajadores no es un archivo: la empresa lo confirma (ing_listados). */
export type TipoDocEmpresa = 'adhesion' | 'contratos' | 'reglamento' | 'f30'

export const DOCS_EMPRESA: { key: TipoDocEmpresa; label: string; corto: string }[] = [
  { key: 'adhesion', label: 'Certificado de adhesión al organismo administrador', corto: 'Adhesión' },
  { key: 'contratos', label: 'Contratos de trabajo', corto: 'Contratos' },
  { key: 'reglamento', label: 'Recepción del reglamento interno', corto: 'Reglamento' },
  { key: 'f30', label: 'Formulario F30', corto: 'F30' },
]

/** Hasta este día del mes la documentación del mes está "pendiente"; después, "atrasada". */
export const DIA_LIMITE_EMPRESA = 10

