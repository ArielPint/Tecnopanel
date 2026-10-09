export type EstadoSso = 'abierto' | 'en_proceso' | 'pend_verificacion' | 'cerrado'

export type TipoEvidencia = 'deteccion' | 'cierre'

/** Fila de la vista sso_hallazgos_v: la tabla más vencido / días de atraso / cumplimiento de plazo. */
export interface Hallazgo {
  id: string
  numero: number
  area_id: string | null
  ubicacion: string
  descripcion: string
  fecha_deteccion: string
  reportado_por: string
  responsable_user_id: string
  fecha_compromiso: string
  estado: EstadoSso
  accion_correctiva: string | null
  cerrado_por: string | null
  fecha_cierre: string | null
  created_at: string
  updated_at: string
  vencido: boolean
  dias_atraso: number
  cerrado_en_plazo: boolean | null
  /** si lo generó una inspección (fase 5) */
  origen_inspeccion_id: string | null
}

export interface Area {
  id: string
  nombre: string
  encargado_user_id: string | null
  activa: boolean
}

export interface Evidencia {
  id: string
  hallazgo_id: string
  tipo: TipoEvidencia
  path: string
  nombre: string | null
  subido_por: string | null
  created_at: string
}

export interface EventoBitacora {
  id: string
  hallazgo_id: string
  user_id: string | null
  evento: 'creado' | 'estado' | 'responsable' | 'plazo' | 'accion_correctiva' | 'evidencia' | 'comentario'
  estado_anterior: EstadoSso | null
  estado_nuevo: EstadoSso | null
  comentario: string | null
  created_at: string
}

export interface UsuarioSso {
  id: string
  nombre: string
  email: string
}

/** Acciones de permisos.accion sobre el ancla SSO (el CHECK de la tabla no admite otras). */
export type AccionSso = 'ver' | 'crear' | 'editar' | 'aprobar' | 'exportar' | 'eliminar'
