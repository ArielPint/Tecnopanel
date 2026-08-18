// Categorías/partidas de la hoja "CR" (avance en obra) — portadas 1:1 desde
// dashboard_avance_la_chacra_10.html. Wedo y Conbes comparten el mismo listado
// de partidas; se diferencian por la asignación de subcontrato cargada en la
// pestaña Configuración (obra_cr_config.subcontrato), no por texto de partida.
export type ObraCategoria = 'electrico' | 'sanitario' | 'wedo' | 'conbes' | 'ventanas'

export function normalize(str: unknown): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .normalize('NFD')
    .replace(new RegExp('[̀-ͯ]', 'g'), '')
    .toLowerCase()
    .replace(/[:.]/g, ' ')
    .replace(/[–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface CategoryDef {
  label: string
  splitTeam: false | 'W' | 'C'
  partidas: string[] | null
}

const WEDO_CONBES_PARTIDAS = [
  'balcon (terminaciones)',
  'revestimiento interior zona seca',
  'revestimiento interior zonas humedas',
  'puertas acceso',
  'puertas logia y bano',
  'puertas dormitorio',
  'extraccion forzada bano y cocina',
  'ventilacion pasiva',
  'pavimento zona humeda (instalacion vinilico)',
  'molduras',
  'pintura exterior',
]

export const CATEGORY_DEFS: Record<ObraCategoria, CategoryDef> = {
  electrico: {
    label: 'Eléctrico',
    splitTeam: false,
    partidas: [
      'tablero de distribucion de alumbrado',
      'canalizacion',
      'conductores',
      'artefactos',
      'prueba de funcionamiento electrico',
      'iluminacion',
      'corrientes debiles (caja pau)',
      'corrientes debiles (canalizaciones y salida)',
    ],
  },
  sanitario: {
    label: 'Sanitario',
    splitTeam: false,
    partidas: [
      'lavamanos',
      'tina',
      'w c',
      'lavaplatos',
      'lavadero exterior',
      'lavadora (llaves y descarga)',
      'a p distribucion interior (red interior)',
      'a p distribucion interior (prueba presion)',
      'alcantarillado domiciliario (red interior)',
      'alcantarillado domiciliario (prueba estanqueidad)',
    ],
  },
  wedo: { label: 'Wedo', splitTeam: 'W', partidas: WEDO_CONBES_PARTIDAS },
  conbes: { label: 'Conbes', splitTeam: 'C', partidas: WEDO_CONBES_PARTIDAS },
  ventanas: {
    label: 'Ventanas',
    splitTeam: false,
    partidas: ['ventanas dormitorios', 'ventanas living comedor y bano'],
  },
}

export function findCategoriaForPartida(rawName: string): { single: ObraCategoria } | { wedoConbes: true } | null {
  const n = normalize(rawName)
  if (!n) return null
  for (const key of Object.keys(CATEGORY_DEFS) as ObraCategoria[]) {
    if (key === 'wedo') continue // wedo/conbes comparten lista, se evalúa una sola vez (bajo 'conbes')
    if (CATEGORY_DEFS[key].partidas!.includes(n)) {
      if (key === 'conbes') return { wedoConbes: true }
      return { single: key }
    }
  }
  return null
}

// Orden de partidas para la Vista General (matriz módulo x partida) — igual al html original.
export const VIEWC_ORDER_RAW = [
  'A:P. distribución interior (Red Interior)',
  'A:P. distribución interior (Prueba presion)',
  'Alcantarillado Domiciliario (Red Interior)',
  'Alcantarillado Domiciliario (Prueba Estanqueidad)',
  'Canalizacion',
  'Revestimiento interior Zona seca',
  'Ventanas Dormitorios',
  'Ventanas Living – Comedor y baño',
  'Pintura exterior',
  'Ventilacion Pasiva',
  'Pavimento Zona Húmeda (Instalacion vinilico)',
  'Revestimiento interior Zonas Húmedas',
  'Lavamanos',
  'Tina',
  'W.C.',
  'Lavaplatos',
  'Lavadero Exterior',
  'Lavadora (Llaves y descarga)',
  'Puertas Acceso',
  'Puertas Logia y Baño',
  'Puertas dormitorio',
  'Molduras',
  'Extraccion Forzada - Baño y Cocina',
  'Conductores',
  'Artefactos',
  'Prueba de Funcionamiento Electrico',
  'Iluminacion',
  'Corrientes debiles (caja pau)',
  'Corrientes debiles (canalizaciones y salida)',
  'Tablero de Distribución de Alumbrado',
  'Balcon (terminaciones)',
]
export const VIEWC_ORDER_NORM = VIEWC_ORDER_RAW.map(normalize)

export const CAT_LABELS: Record<string, string> = {
  electrico: 'Eléctrico',
  sanitario: 'Sanitario',
  wedo_conbes: 'Wedo / Conbes',
  ventanas: 'Ventanas',
}

// Abreviatura fija por categoría para el header agrupado de Vista General —
// siempre el mismo texto sin importar cuántas columnas abarque el grupo,
// para que no cambie de "ELÉC" a "Eléctrico" según el ancho disponible.
export const CAT_LABELS_CORTO: Record<string, string> = {
  electrico: 'ELÉC',
  sanitario: 'SANIT',
  wedo_conbes: 'W/C',
  ventanas: 'VENT',
}

// Subcontratos que ejecutan el trabajo en obra. 'terminaciones' se reparte entre
// We Do y Conbes (elegible por módulo); las otras 3 categorías tienen un único
// subcontrato fijo — igual se guarda en obra_cr_config para no tener que
// hardcodear la relación categoria->subcontrato en cada lugar que lo consume.
export type ObraSubcontrato = 'W' | 'C' | 'ICG' | 'PDUARTE' | 'INGELAGOS'

export const SUBCONTRATO_LABEL: Record<ObraSubcontrato, string> = {
  W: 'We Do',
  C: 'Conbes',
  ICG: 'ICG',
  PDUARTE: 'Pduarte',
  INGELAGOS: 'Ingelagos',
}

export type AsignacionCategoria = 'terminaciones' | 'electrico' | 'sanitario' | 'ventanas'

export const ASIGNACION_DEFS: Record<AsignacionCategoria, { label: string; subcontratoFijo: ObraSubcontrato | null }> = {
  terminaciones: { label: 'Terminaciones', subcontratoFijo: null },
  electrico: { label: 'Eléctrico', subcontratoFijo: 'ICG' },
  sanitario: { label: 'Sanitario', subcontratoFijo: 'PDUARTE' },
  ventanas: { label: 'Ventanas', subcontratoFijo: 'INGELAGOS' },
}

export const ASIGNACION_ORDER: AsignacionCategoria[] = ['terminaciones', 'electrico', 'sanitario', 'ventanas']

// Mapea las categorías del checklist CR (electrico/sanitario/wedo/conbes/ventanas)
// a su categoría de asignación de subcontrato+fecha (wedo y conbes comparten 'terminaciones').
export const ASIGNACION_POR_CR_CATEGORIA: Record<ObraCategoria, AsignacionCategoria> = {
  electrico: 'electrico',
  sanitario: 'sanitario',
  wedo: 'terminaciones',
  conbes: 'terminaciones',
  ventanas: 'ventanas',
}
