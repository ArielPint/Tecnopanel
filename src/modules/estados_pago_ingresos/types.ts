export type EstadoEPIngreso = 'emitido' | 'en_revision' | 'aprobado' | 'rechazado' | 'pagado'

export interface EstadoPagoIngreso {
  id: string
  proyecto_id: string
  numero_ep: string
  periodo: string | null
  fecha_emision: string | null
  fecha_recepcion: string | null
  estado: EstadoEPIngreso
  monto_bruto: number
  descuentos: number
  retenciones: number
  monto_neto: number
  monto_cobrado: number
  saldo_pendiente: number
  observaciones: string | null
  documento_principal_path: string | null
  creado_por: string | null
  created_at: string
  actualizado_por: string | null
  updated_at: string
}

export interface EstadoPagoIngresoDocumento {
  id: string
  estado_pago_ingreso_id: string
  nombre: string
  storage_path: string
  subido_por: string | null
  created_at: string
}

export interface EstadoPagoIngresoHistorialItem {
  id: string
  estado_pago_ingreso_id: string
  estado_anterior: EstadoEPIngreso | null
  estado_nuevo: EstadoEPIngreso
  cambiado_por: string | null
  comentario: string | null
  created_at: string
}
