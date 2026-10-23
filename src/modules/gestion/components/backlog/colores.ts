import type { ChartConfig } from '@/modules/financiero/components/ui/chart'
import { SIN_LINEA, SIN_SUCURSAL } from '../../lib/backlogAnalisis'

// Paleta categórica validada (8 tonos, orden fijo, claro/oscuro). Cada línea de negocio y cada sucursal
// tiene SIEMPRE el mismo color, aunque un filtro deje menos series.
const PALETA = [
  { light: '#2a78d6', dark: '#3987e5' }, // azul
  { light: '#eb6834', dark: '#d95926' }, // naranjo
  { light: '#1baf7a', dark: '#199e70' }, // aqua
  { light: '#eda100', dark: '#c98500' }, // amarillo
  { light: '#e87ba4', dark: '#d55181' }, // magenta
  { light: '#008300', dark: '#008300' }, // verde
  { light: '#4a3aa7', dark: '#9085e9' }, // violeta
  { light: '#e34948', dark: '#e66767' }, // rojo
] as const
const GRIS = { light: '#8a8984', dark: '#7c7b76' }

export const COLOR_PRINCIPAL = PALETA[0]
export const COLOR_SECUNDARIO = PALETA[1]
export const COLOR_SUBE = PALETA[2]

/** Orden de las líneas (como en Ventas) con su clave CSS. */
export const LINEAS: { nombre: string; clave: string }[] = [
  { nombre: 'SIP', clave: 'sip' },
  { nombre: 'Madera', clave: 'madera' },
  { nombre: 'Acero', clave: 'acero' },
  { nombre: 'Escaleras', clave: 'escaleras' },
  { nombre: 'Wall', clave: 'wall' },
  { nombre: 'Tecno Home', clave: 'tecnohome' },
  { nombre: 'Viv. Ind. Panelizada', clave: 'vip' },
  { nombre: 'Viv. Ind. Modular', clave: 'vim' },
  { nombre: SIN_LINEA, clave: 'sinlinea' },
]

export const SUCURSALES: { nombre: string; clave: string }[] = [
  { nombre: 'Santiago', clave: 'stgo' },
  { nombre: 'Puerto Varas', clave: 'ptovaras' },
  { nombre: SIN_SUCURSAL, clave: 'sinsucursal' },
]

export const CONFIG_LINEAS: ChartConfig = Object.fromEntries(
  LINEAS.map((l, i) => [l.clave, { label: l.nombre, theme: PALETA[i] ?? GRIS }]),
)
CONFIG_LINEAS.sinlinea = { label: SIN_LINEA, theme: GRIS }

export const CONFIG_SUCURSALES: ChartConfig = {
  stgo: { label: 'Santiago', theme: PALETA[0] },
  ptovaras: { label: 'Puerto Varas', theme: PALETA[1] },
  sinsucursal: { label: SIN_SUCURSAL, theme: GRIS },
}

export function claveLinea(nombre: string): string {
  return LINEAS.find((l) => l.nombre === nombre)?.clave ?? 'sinlinea'
}

export function claveSucursal(nombre: string): string {
  return SUCURSALES.find((s) => s.nombre === nombre)?.clave ?? 'sinsucursal'
}
