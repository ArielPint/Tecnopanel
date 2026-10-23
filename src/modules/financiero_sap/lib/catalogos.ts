// Portal Financiero: catálogos compartidos por las pantallas y por la pestaña de accesos de Usuarios.
// Los mismos valores están en la migración 20261019120000_financiero_sap.sql (fin_usuario_tiene_en,
// fin_linea_de): si cambia uno, cambia el otro.

/** Un permiso por fila: modulo_key 'fin:<informe>:<sucursal>', accion 'ver', sobre el ancla FIN_ANCLA_ID. */
export type InformeFin = 'eerr' | 'ventas' | 'balance'

export const INFORMES_FIN: { key: InformeFin; label: string; detalle: string }[] = [
  {
    key: 'eerr',
    label: 'Estado de resultados',
    detalle: 'Ingresos, costos y gastos contables de SAP por línea, CECO y sucursal, con el detalle de asientos.',
  },
  { key: 'ventas', label: 'Ventas', detalle: 'Ventas según el libro de ventas de SAP.' },
  {
    key: 'balance',
    label: 'Balance',
    detalle: 'Balance general y estado de situación financiera IFRS de toda la empresa (no tiene sucursal: basta marcar una).',
  },
]

/** Permiso sin sucursal: modulo_key 'fin:configurar'. Edita los % de prorrateo de la administración. */
export const PERMISO_CONFIGURAR = 'configurar'

/** Grupos del plan de cuentas de resultado (OACT.GroupMask). */
export const GRUPOS: { grupo: number; nombre: string }[] = [
  { grupo: 4, nombre: 'Ingresos operacionales' },
  { grupo: 5, nombre: 'Costos de ventas' },
  { grupo: 6, nombre: 'Gastos de explotación' },
  { grupo: 7, nombre: 'Otros ingresos' },
  { grupo: 8, nombre: 'Otros egresos' },
]

/** Orden de las líneas de negocio (como en Ventas); la administración al final. */
export const LINEAS = [
  'SIP',
  'Madera',
  'Acero',
  'Escaleras',
  'Wall',
  'Tecno Home',
  'Viv. Ind. Panelizada',
  'Viv. Ind. Modular',
  'Administración',
] as const

/** Tipo de transacción de SAP (OJDT.TransType) de los asientos que más aparecen. */
export const TIPOS_TRANSACCION: Record<string, string> = {
  '13': 'Factura de clientes',
  '14': 'Nota de crédito de clientes',
  '15': 'Entrega',
  '16': 'Devolución',
  '18': 'Factura de proveedores',
  '19': 'Nota de crédito de proveedores',
  '20': 'Entrada de mercancías (OC)',
  '21': 'Devolución de mercancías',
  '24': 'Pago recibido',
  '30': 'Asiento manual',
  '46': 'Pago efectuado',
  '59': 'Entrada de mercancías',
  '60': 'Salida de mercancías',
  '67': 'Transferencia de stock',
  '69': 'Costo de importación',
  '162': 'Revalorización de inventario',
  '202': 'Orden de fabricación',
  '203': 'Factura de anticipo de clientes',
  '204': 'Factura de anticipo de proveedores',
  '321': 'Reconciliación',
}
