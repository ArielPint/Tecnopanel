export interface Empresa {
  id: string
  nombre: string
  rut: string | null
  propia: boolean
  activa: boolean
}

export interface TipoExamen {
  id: string
  nombre: string
  /** null: no vence (ej. preocupacional) */
  vigencia_meses: number | null
  activo: boolean
}

export interface Trabajador {
  id: string
  rut: string
  nombres: string
  apellidos: string
  empresa_id: string
  cargo: string | null
  area_id: string | null
  fecha_ingreso: string | null
  telefono: string | null
  email: string | null
  contacto_emergencia: string | null
  user_id: string | null
  activo: boolean
  fecha_baja: string | null
  observaciones: string | null
  created_at: string
  updated_at: string
}

/** Fila de sso_trabajadores_v. Los conteos de exámenes salen en 0 si no se tiene el permiso de salud. */
export interface TrabajadorV extends Trabajador {
  empresa: string
  empresa_propia: boolean
  examenes_vencidos: number
  examenes_por_vencer: number
  examenes_con_restriccion: number
}

export type ResultadoExamen = 'apto' | 'apto_con_restricciones' | 'no_apto'

export const RESULTADOS: { key: ResultadoExamen; label: string }[] = [
  { key: 'apto', label: 'Apto' },
  { key: 'apto_con_restricciones', label: 'Apto con restricciones' },
  { key: 'no_apto', label: 'No apto' },
]

export interface Examen {
  id: string
  trabajador_id: string
  tipo_id: string
  fecha: string
  vencimiento: string | null
  resultado: ResultadoExamen
  observaciones: string | null
  archivo_path: string | null
  archivo_nombre: string | null
  registrado_por: string | null
  created_at: string
}

export type SituacionExamen = 'vigente' | 'por_vencer' | 'vencido'

/** Fila de sso_examenes_vigentes: el último examen de cada tipo del trabajador. */
export interface ExamenVigente extends Examen {
  situacion: SituacionExamen
}

/** Campos editables de la ficha (alta, edición e importación). */
export type FichaTrabajador = Pick<
  Trabajador,
  'rut' | 'nombres' | 'apellidos' | 'empresa_id' | 'cargo' | 'area_id' | 'fecha_ingreso' | 'telefono' | 'email' | 'contacto_emergencia' | 'observaciones'
>
