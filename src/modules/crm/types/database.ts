export type RolUsuario =
  | 'admin' | 'gerente_ventas' | 'gerente_general' | 'vendedor'
  | 'jefe_ingenieria' | 'ingeniero' | 'cubicador' | 'presupuestista' | 'finanzas'
  | 'desarrollador'

export type TipoVenta = 'Proyecto' | 'Producto' | 'Kit'

export type EtapaOportunidad = string

export type EstadoTarea = 'pendiente' | 'en_progreso' | 'completada' | 'rechazada'
export type ResultadoCredito = 'aprobado' | 'rechazado' | 'observado' | 'pendiente'

export interface Profile {
  id: string
  nombre: string
  apellido: string
  email: string
  rol: RolUsuario
  activo: boolean
  modulos: string[]
  must_change_password: boolean
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Cliente {
  id: string
  razon_social: string
  rut: string | null
  tipo: 'empresa' | 'persona_natural'
  rubro: string | null
  ciudad: string | null
  contacto_nombre: string | null
  contacto_email: string | null
  contacto_fono: string | null
  es_nuevo: boolean
  created_at: string
}

export interface Oportunidad {
  id: string
  codigo: string
  nombre: string
  cliente_id: string | null
  tipo_venta: TipoVenta
  etapa_actual: EtapaOportunidad
  requiere_ingenieria: boolean
  probabilidad: number
  monto_estimado: number | null
  monto_final: number | null
  moneda: string
  vendedor_id: string | null
  fecha_cierre_est: string | null
  fecha_cierre_real?: string | null
  motivo_perdida: string | null
  descripcion: string | null
  notas_internas?: string | null
  nombre_entidad_patrocinante: string | null
  region: string | null
  comuna: string | null
  cantidad_casas: number | null
  cantidad_tipos_casas: number | null
  fecha_adjudicacion_est: string | null
  fecha_inicio_despachos_est: string | null
  duracion_meses_est: number | null
  familia_productos: string[] | null
  alcances: string[] | null
  margen_porcentaje: number | null
  created_at: string
  updated_at: string
  cliente?: Cliente
  vendedor?: Profile
}

export interface OportunidadHistorialEtapa {
  id: string
  oportunidad_id: string
  etapa: string
  usuario_id: string | null
  fecha_entrada: string
  fecha_salida: string | null
  notas: string | null
  usuario?: Profile
}

export interface OportunidadAsignacion {
  id: string
  oportunidad_id: string
  etapa: string
  usuario_id: string
  asignado_por: string | null
  created_at: string
  usuario?: Profile
}

export interface OportunidadDocumento {
  id: string
  oportunidad_id: string
  nombre: string
  tipo: 'archivo' | 'link'
  url: string
  extension: string | null
  tamanio_bytes: number | null
  subido_por: string | null
  etapa: string | null
  comentario: string | null
  created_at: string
  subido_por_profile?: Profile
}

export interface Cierre {
  id: string
  oportunidad_id: string
  resultado: 'ganado' | 'perdido'
  motivo: string | null
  monto_oc: number | null
  numero_oc: string | null
  fecha_oc: string | null
  storage_oc_path: string | null
  registrado_por: string | null
  created_at: string
}

export interface MensajeOportunidad {
  id: string
  oportunidad_id: string
  etapa: string | null
  usuario_id: string | null
  mensaje: string
  created_at: string
  usuario?: Profile
}

export interface ClienteHistorial {
  id: string
  cliente_id: string
  usuario_id: string | null
  tipo: 'creacion' | 'modificacion'
  datos_antes: Record<string, unknown> | null
  datos_despues: Record<string, unknown> | null
  created_at: string
  usuario?: Profile
}

export interface OportunidadDatosEtapa {
  id: string
  oportunidad_id: string
  etapa: string
  datos: Record<string, unknown>
  updated_by: string | null
  updated_at: string
}

export interface TareaIngenieria {
  id: string
  oportunidad_id: string
  titulo: string
  descripcion: string | null
  estado: EstadoTarea
  prioridad: number
  fecha_limite: string | null
  created_at: string
  asignados?: Profile[]
}

export interface TareaAsignacion {
  id: string
  tarea_id: string
  usuario_id: string
  asignado_por: string | null
  created_at: string
  usuario?: Profile
}

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile }
      clientes: { Row: Cliente }
      oportunidades: { Row: Oportunidad }
      tareas_ingenieria: { Row: TareaIngenieria }
      tarea_asignaciones: { Row: TareaAsignacion }
      oportunidad_historial_etapas: { Row: OportunidadHistorialEtapa }
      oportunidad_asignaciones: { Row: OportunidadAsignacion }
      oportunidad_documentos: { Row: OportunidadDocumento }
      oportunidad_datos_etapa: { Row: OportunidadDatosEtapa }
      mensajes_oportunidad: { Row: MensajeOportunidad }
      cierres: { Row: Cierre }
    }
    Enums: {
      rol_usuario: RolUsuario
      tipo_venta: TipoVenta
      etapa_oportunidad: EtapaOportunidad
      estado_tarea: EstadoTarea
    }
  }
}
