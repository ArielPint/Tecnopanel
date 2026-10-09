import type { AccionSso } from './tipos'

// Portal de Prevención (PLAN_SSO_PORTAL.md): un permiso por módulo, igual que el CRM.
// En la base: permisos.modulo_key = 'sso:<key>' sobre el ancla SSO_ANCLA_ID, accion ∈ acciones.
// Este catálogo lo usan el menú del portal y la pestaña "Accesos Prevención" de Usuarios; cada fase
// agrega aquí su módulo.

export type ModuloSso = 'hallazgos' | 'accidentes' | 'inspecciones' | 'capacitaciones' | 'epp' | 'trabajadores' | 'documentos' | 'comite' | 'configuracion'

export interface DefModulo {
  key: ModuloSso
  label: string
  grupo: 'Principal' | 'Gestión' | 'Personas y documentos' | 'Sistema'
  ruta: string
  acciones: { key: AccionSso; label: string }[]
}

export const SSO_MODULOS: DefModulo[] = [
  {
    key: 'hallazgos',
    label: 'Hallazgos',
    grupo: 'Principal',
    ruta: '/prevencion/hallazgos',
    acciones: [
      { key: 'ver', label: 'Ver' },
      { key: 'crear', label: 'Reportar (con fotos de la condición)' },
      { key: 'editar', label: 'Encargado de área: acción correctiva y fotos de cierre' },
      { key: 'aprobar', label: 'Validar cierres y editar hallazgos' },
      { key: 'exportar', label: 'Exportar a Excel y PDF' },
      { key: 'eliminar', label: 'Eliminar' },
    ],
  },
  {
    key: 'accidentes',
    label: 'Accidentes e incidentes',
    grupo: 'Gestión',
    ruta: '/prevencion/accidentes',
    acciones: [
      { key: 'ver', label: 'Ver' },
      { key: 'crear', label: 'Reportar eventos (y completarlos mientras están "reportados")' },
      { key: 'editar', label: 'Investigar: atención, DIAT, causas y medidas correctivas' },
      { key: 'aprobar', label: 'Prevención: cerrar investigaciones y cargar dotación y horas-hombre' },
      { key: 'exportar', label: 'Exportar a Excel' },
      { key: 'eliminar', label: 'Eliminar' },
    ],
  },
  {
    key: 'inspecciones',
    label: 'Inspecciones',
    grupo: 'Gestión',
    ruta: '/prevencion/inspecciones',
    acciones: [
      { key: 'ver', label: 'Ver' },
      { key: 'crear', label: 'Realizar inspecciones (cada "no cumple" genera un hallazgo)' },
      { key: 'editar', label: 'Generar hallazgos de inspecciones de otros' },
      { key: 'aprobar', label: 'Gestionar plantillas de checklist y su programa' },
      { key: 'exportar', label: 'Exportar a Excel' },
      { key: 'eliminar', label: 'Eliminar inspecciones' },
    ],
  },
  {
    key: 'capacitaciones',
    label: 'Capacitaciones y charlas',
    grupo: 'Gestión',
    ruta: '/prevencion/capacitaciones',
    acciones: [
      { key: 'ver', label: 'Ver' },
      { key: 'crear', label: 'Registrar capacitaciones y charlas (y editar las propias)' },
      { key: 'editar', label: 'Editar cualquier capacitación' },
      { key: 'exportar', label: 'Exportar a Excel' },
      { key: 'eliminar', label: 'Eliminar' },
    ],
  },
  {
    key: 'epp',
    label: 'Entrega de EPP',
    grupo: 'Gestión',
    ruta: '/prevencion/epp',
    acciones: [
      { key: 'ver', label: 'Ver' },
      { key: 'crear', label: 'Registrar entregas (y editar las propias)' },
      { key: 'editar', label: 'Editar cualquier entrega' },
      { key: 'exportar', label: 'Exportar a Excel' },
      { key: 'eliminar', label: 'Eliminar' },
    ],
  },
  {
    key: 'comite',
    label: 'Comité Paritario',
    grupo: 'Gestión',
    ruta: '/prevencion/comite',
    acciones: [
      { key: 'ver', label: 'Ver (y como responsable, informar el avance de sus acuerdos)' },
      { key: 'crear', label: 'Secretario: registrar reuniones, asistencia, actas y acuerdos' },
      { key: 'editar', label: 'Administrar comités e integrantes y corregir cualquier registro' },
      { key: 'exportar', label: 'Exportar acuerdos a Excel' },
      { key: 'eliminar', label: 'Eliminar' },
    ],
  },
  {
    key: 'trabajadores',
    label: 'Trabajadores',
    grupo: 'Personas y documentos',
    ruta: '/prevencion/trabajadores',
    acciones: [
      { key: 'ver', label: 'Ver' },
      { key: 'crear', label: 'Dar de alta e importar desde Excel' },
      { key: 'editar', label: 'Editar fichas y dar de baja' },
      { key: 'aprobar', label: 'Ver y registrar exámenes ocupacionales (datos de salud)' },
      { key: 'exportar', label: 'Exportar a Excel' },
      { key: 'eliminar', label: 'Eliminar fichas' },
    ],
  },
  {
    key: 'documentos',
    label: 'Documentos',
    grupo: 'Personas y documentos',
    ruta: '/prevencion/documentos',
    acciones: [
      { key: 'ver', label: 'Consultar y descargar' },
      { key: 'crear', label: 'Crear documentos y subir nuevas versiones' },
      { key: 'editar', label: 'Editar cualquier documento y corregir versiones' },
      { key: 'exportar', label: 'Exportar el listado maestro' },
      { key: 'eliminar', label: 'Eliminar' },
    ],
  },
  {
    key: 'configuracion',
    label: 'Configuración',
    grupo: 'Sistema',
    ruta: '/prevencion/configuracion',
    acciones: [
      { key: 'ver', label: 'Ver' },
      { key: 'editar', label: 'Editar áreas, empresas, tipos de examen y de capacitación, catálogo de EPP' },
    ],
  },
]

export const GRUPOS_MENU = ['Principal', 'Gestión', 'Personas y documentos', 'Sistema'] as const

/** Clave del formulario de accesos: '<modulo>:<accion>' (en la base va con prefijo 'sso:'). */
export const claveAcceso = (modulo: ModuloSso, accion: AccionSso) => `${modulo}:${accion}`

/** Cualquier acción de un módulo implica su 'ver': sin ella la RLS no deja leer nada de ese módulo. */
export function normalizarAccionesSso(acciones: Record<string, boolean>): Record<string, boolean> {
  const salida = { ...acciones }
  for (const m of SSO_MODULOS) {
    if (m.acciones.some((a) => a.key !== 'ver' && salida[claveAcceso(m.key, a.key)])) salida[claveAcceso(m.key, 'ver')] = true
  }
  return salida
}
