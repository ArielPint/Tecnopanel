import { cargarXLSX } from '@/lib/cargarLibrerias'
import type { FilaImportacion } from './api'

// Lee el Excel de listas de materiales de SAP (como PNL_SIP.xlsx): una fila por material de cada
// panel. Solo se usa la "Cantidad base" (lo que consume 1 panel); el resto de las columnas
// (Ratio base, Ctd. requerida, Disponible) se ignora.

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

// encabezado normalizado -> campo. "Descripción" a secas es la del material; la del panel es
// "Descripción del artículo".
const ALIAS: Record<string, keyof FilaImportacion> = {
  numerodearticulo: 'panel_codigo',
  codigopanel: 'panel_codigo',
  panel: 'panel_codigo',
  descripciondelarticulo: 'panel_descripcion',
  descripcionpanel: 'panel_descripcion',
  n: 'material_codigo',
  no: 'material_codigo',
  codigomaterial: 'material_codigo',
  material: 'material_codigo',
  descripcion: 'material_descripcion',
  descripcionmaterial: 'material_descripcion',
  cantidadbase: 'cantidad',
  cantidad: 'cantidad',
  nombredeunidaddemedida: 'unidad',
  unidaddemedida: 'unidad',
  unidad: 'unidad',
}

const OBLIGATORIAS: (keyof FilaImportacion)[] = ['panel_codigo', 'panel_descripcion', 'material_codigo', 'material_descripcion', 'cantidad']

const NOMBRE: Record<keyof FilaImportacion, string> = {
  panel_codigo: 'Número de artículo',
  panel_descripcion: 'Descripción del artículo',
  material_codigo: 'Nº',
  material_descripcion: 'Descripción',
  cantidad: 'Cantidad base',
  unidad: 'Nombre de unidad de medida',
}

/** "0,92" o "0.92" o 0.92 -> 0.92 */
function aNumero(v: unknown): number {
  if (typeof v === 'number') return v
  const s = String(v ?? '').trim()
  if (!s) return NaN
  // con coma decimal chilena ("1.234,5"), los puntos son miles
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
}

export interface ResultadoLectura {
  filas: FilaImportacion[]
  paneles: number
  errores: string[]
}

export async function leerExcelRecetas(archivo: File): Promise<ResultadoLectura> {
  const XLSX = await cargarXLSX()
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, blankrows: false, raw: true })

  // la fila de encabezados es la primera que tiene todas las columnas obligatorias
  let filaEnc = -1
  let columnas: Partial<Record<keyof FilaImportacion, number>> = {}
  for (let i = 0; i < Math.min(matriz.length, 15) && filaEnc < 0; i++) {
    const cols: Partial<Record<keyof FilaImportacion, number>> = {}
    ;(matriz[i] ?? []).forEach((celda, j) => {
      const campo = ALIAS[norm(celda)]
      if (campo && cols[campo] === undefined) cols[campo] = j
    })
    if (OBLIGATORIAS.every((c) => cols[c] !== undefined)) {
      filaEnc = i
      columnas = cols
    }
  }
  if (filaEnc < 0) {
    return { filas: [], paneles: 0, errores: [`No encuentro los encabezados. Se necesitan: ${OBLIGATORIAS.map((c) => NOMBRE[c]).join(', ')}.`] }
  }

  const filas: FilaImportacion[] = []
  const errores: string[] = []
  const vistos = new Set<string>()
  for (let i = filaEnc + 1; i < matriz.length; i++) {
    const r = matriz[i] ?? []
    const v = (c: keyof FilaImportacion) => (columnas[c] === undefined ? '' : r[columnas[c]!])
    const panel = String(v('panel_codigo') ?? '').trim()
    const material = String(v('material_codigo') ?? '').trim()
    if (!panel && !material) continue
    const fila = i + 1 // número de fila en Excel
    const cantidad = aNumero(v('cantidad'))
    if (!panel || !material) {
      errores.push(`Fila ${fila}: falta el código de ${!panel ? 'panel' : 'material'}`)
      continue
    }
    if (!(cantidad > 0)) {
      errores.push(`Fila ${fila}: la cantidad base de ${material} en ${panel} no es un número mayor que 0`)
      continue
    }
    const clave = `${panel}|${material}`
    if (vistos.has(clave)) {
      errores.push(`Fila ${fila}: el material ${material} se repite en el panel ${panel}`)
      continue
    }
    vistos.add(clave)
    filas.push({
      panel_codigo: panel,
      panel_descripcion: String(v('panel_descripcion') ?? '').trim() || panel,
      material_codigo: material,
      material_descripcion: String(v('material_descripcion') ?? '').trim() || material,
      cantidad,
      unidad: String(v('unidad') ?? '').trim().toUpperCase() || 'UNIDAD',
    })
  }
  return { filas, paneles: new Set(filas.map((f) => f.panel_codigo)).size, errores }
}

/** Plantilla vacía con los encabezados que reconoce el importador. */
export async function descargarPlantillaRecetas() {
  const XLSX = await cargarXLSX()
  const hoja = XLSX.utils.aoa_to_sheet([
    ['Número de artículo', 'Descripción del artículo', 'Nº', 'Descripción', 'Cantidad base', 'Nombre de unidad de medida'],
    ['6602003', 'PNL-STD 11,1/57/STD 11,1 ; 1220x2440x78mm', '2001005', 'OSB APA Protec 11,1mm (1,22x2,44m)', 2, 'UNIDAD'],
  ])
  hoja['!cols'] = [16, 48, 12, 48, 14, 24].map((wch) => ({ wch }))
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Recetas')
  XLSX.writeFile(libro, 'plantilla-recetas-paneles-sip.xlsx')
}
