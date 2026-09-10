import type * as XLSX from 'xlsx'

/** Resumen mensual de mano de obra directa extraído de la planilla de remuneraciones. */
export interface DotacionMes {
  anio: number | null
  mes: number | null
  personas: number
  diasHombre: number
  costoEmpresa: number
  hoja: string
}

const MESES_NOMBRE = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
]

/** Sin tildes, mayúsculas y con espacios colapsados — los encabezados vienen con
 * "DÍAS TRABAJADOS", "GRATIFICACIÓN", etc. y a veces con saltos de línea. */
function norm(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function num(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const n = parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.'))
  return isFinite(n) ? n : 0
}

/** "AGOSTO 2026" -> { anio: 2026, mes: 8 }. Devuelve nulls si no calza. */
export function periodoDesdeTexto(texto: string): { anio: number | null; mes: number | null } {
  const t = norm(texto)
  const mes = MESES_NOMBRE.findIndex((m) => t.includes(m))
  const anio = t.match(/(20\d{2})/)
  return { anio: anio ? +anio[1] : null, mes: mes >= 0 ? mes + 1 : null }
}

/**
 * Lee la planilla "Remuneraciones <MES> <AÑO> Planta Sur": cuenta las personas y
 * suma DÍAS TRABAJADOS y COSTO EMPRESA. Corta en la fila de totales, así que el
 * total no se cuenta dos veces ni suma como una persona más.
 */
export function parseDotacion(wb: XLSX.WorkBook, XLSXlib: typeof XLSX): DotacionMes {
  const hoja = wb.SheetNames[0]
  const ws = wb.Sheets[hoja]
  if (!ws) throw new Error('El archivo no tiene hojas')
  const filas = XLSXlib.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as unknown[][]

  const iHeader = filas.findIndex((f) => f.some((c) => norm(c) === 'RUT'))
  if (iHeader < 0) throw new Error('No se encontró la fila de encabezados (columna RUT)')

  const header = filas[iHeader].map(norm)
  const cRut = header.indexOf('RUT')
  const cDias = header.findIndex((h) => h.startsWith('DIAS TRABAJADOS'))
  const cCosto = header.findIndex((h) => h.startsWith('COSTO EMPRESA'))
  if (cCosto < 0) throw new Error('No se encontró la columna COSTO EMPRESA')

  let personas = 0
  let diasHombre = 0
  let costoEmpresa = 0
  for (const f of filas.slice(iHeader + 1)) {
    const rut = norm(f[cRut])
    // fila de totales o vacía -> fin de la nómina
    if (!rut) continue
    if (rut.includes('TOTAL')) break
    if (f.some((c) => norm(c).startsWith('TOTAL '))) break
    personas += 1
    if (cDias >= 0) diasHombre += num(f[cDias])
    costoEmpresa += num(f[cCosto])
  }
  if (personas === 0) throw new Error('No se leyó ninguna persona en la planilla')

  return { ...periodoDesdeTexto(hoja), personas, diasHombre, costoEmpresa, hoja }
}

export function demoPeriodoDesdeTexto() {
  console.assert(periodoDesdeTexto('AGOSTO 2026').mes === 8, 'AGOSTO -> 8')
  console.assert(periodoDesdeTexto('AGOSTO 2026').anio === 2026, 'AGOSTO 2026 -> 2026')
  console.assert(periodoDesdeTexto('Diciembre 2027').mes === 12, 'Diciembre -> 12')
  console.assert(periodoDesdeTexto('Hoja1').mes === null, 'sin mes -> null')
}
