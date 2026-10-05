// Datos del cliente en dos tramos: los básicos se exigen al crearlo (ficha de Clientes y
// "Crear cliente nuevo" de la oportunidad); el resto recién al cargar la OC en Negociación,
// donde la RPC crm_completar_cliente_oc rellena lo que falte.

export type CampoCliente =
  | 'rut' | 'razon_social' | 'giro' | 'contacto_fono' | 'contacto_email'
  | 'rubro' | 'direccion' | 'ciudad' | 'region' | 'contacto_nombre'

export const CAMPOS_BASICOS: CampoCliente[] = ['rut', 'razon_social', 'giro', 'contacto_fono', 'contacto_email']
export const CAMPOS_OC: CampoCliente[] = ['rubro', 'direccion', 'ciudad', 'region', 'contacto_nombre']

export const CAMPO_CLIENTE_LABEL: Record<CampoCliente, string> = {
  rut: 'RUT', razon_social: 'Nombre / Razón social', giro: 'Giro',
  contacto_fono: 'Teléfono', contacto_email: 'Correo',
  rubro: 'Rubro', direccion: 'Dirección', ciudad: 'Ciudad', region: 'Región',
  contacto_nombre: 'Nombre de contacto',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const esEmailValido = (v: string) => EMAIL_RE.test(v.trim())

export function camposFaltantes(c: Partial<Record<CampoCliente, string | null>>, campos: CampoCliente[]) {
  return campos.filter(k => !String(c[k] ?? '').trim())
}

/** Mensaje de error para los datos básicos, o null si están completos y válidos. */
export function errorDatosBasicos(c: Partial<Record<CampoCliente, string | null>>): string | null {
  const faltan = camposFaltantes(c, CAMPOS_BASICOS)
  if (faltan.length) return 'Faltan datos obligatorios: ' + faltan.map(k => CAMPO_CLIENTE_LABEL[k]).join(', ')
  if (!esEmailValido(String(c.contacto_email))) return 'El correo no es válido'
  return null
}
