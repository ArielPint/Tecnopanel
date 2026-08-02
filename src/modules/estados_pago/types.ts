export interface Subcontratista {
  id: string
  nombre: string
  rut: string | null
  giro: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  notas: string | null
  activo: boolean
  created_at: string
}

export interface Subcontrato {
  id: string
  proyecto_id: string
  subcontratista_id: string
  especialidad: string
  responsable_interno_id: number | null
  monto_contractual: number
  documentacion_path: string | null
  estado: string
  created_at: string
  updated_at: string
}

export type EstadoEP = 'emitido' | 'en_revision' | 'aprobado' | 'rechazado' | 'pagado'

export interface EstadoPago {
  id: string
  subcontrato_id: string
  proyecto_id: string
  numero_ep: string
  periodo: string | null
  fecha_emision: string | null
  fecha_recepcion: string | null
  estado: EstadoEP
  monto_bruto: number
  descuentos: number
  retenciones: number
  monto_neto: number
  monto_pagado: number
  saldo_pendiente: number
  observaciones: string | null
  documento_principal_path: string | null
  creado_por: string | null
  created_at: string
  actualizado_por: string | null
  updated_at: string
}

export interface EstadoPagoDocumento {
  id: string
  estado_pago_id: string
  nombre: string
  storage_path: string
  subido_por: string | null
  created_at: string
}

export interface EstadoPagoHistorialItem {
  id: string
  estado_pago_id: string
  estado_anterior: EstadoEP | null
  estado_nuevo: EstadoEP
  cambiado_por: string | null
  comentario: string | null
  created_at: string
}
