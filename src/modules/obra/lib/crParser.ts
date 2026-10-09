import type { WorkBook, WorkSheet } from 'xlsx'
import type { XLSXLib } from '@/lib/cargarLibrerias'
import { supabase } from '@/lib/supabaseClient'
import { CATEGORY_DEFS, findCategoriaForPartida, normalize } from './categorias'

export type ChipEstado = 'ok' | 'no' | 'na'

type TipoModulo = 'SECO' | 'HUMEDO'

export interface ObraCrModuloRow {
  moduloNum: number
  code: string
  tipo: TipoModulo
  // clave = nombre crudo de la partida (tal cual columna B del CR)
  estados: Record<string, ChipEstado>
  terminado: boolean
}

// 'cr' = formato antiguo (una hoja "CR" con todos los módulos).
// 'edificios' = formato nuevo (una hoja "Edificio N°x" por edificio + hoja "Compromisos").
export type FormatoCR = 'cr' | 'edificios'

export interface ParseCRResult {
  formato: FormatoCR
  rows: ObraCrModuloRow[]
}

// Columna de módulo ya resuelta. colIdx indexa el rowData de cada PartidaRow
// (en el formato por edificios es un índice global que junta todas las hojas).
interface Col { colIdx: number; num: number; tipo: TipoModulo; code: string }
interface PartidaRow { name: string; rowData: unknown[] }

// Estas partidas nunca aplican a módulos SECO, sin importar lo que traiga el Excel:
// todo "sanitario" (lavamanos, tina, w.c., etc — un módulo seco no lleva baño/cocina
// con agua) más 2 partidas eléctricas puntuales que tampoco corresponden a seco.
const SOLO_HUMEDO_FORZADO = new Set(['corrientes debiles (caja pau)', 'tablero de distribucion de alumbrado'])

function tieneValor(v: unknown): boolean {
  return v !== null && v !== undefined && String(v).trim() !== ''
}

function codigoModulo(num: number): string {
  return 'M-' + String(num).padStart(5, '0')
}

// Común a ambos formatos: una celda con cualquier valor = partida hecha ("ok"),
// vacía = pendiente ("no"); "na" si la partida no aplica al tipo del módulo.
function armarModulos(columns: Col[], partidas: PartidaRow[], esTerminado: (col: Col) => boolean): ObraCrModuloRow[] {
  function computeApplicableTipos(rowData: unknown[]): TipoModulo[] {
    let hasSeco = false
    let hasHumedo = false
    for (const col of columns) {
      if (tieneValor(rowData[col.colIdx])) { if (col.tipo === 'SECO') hasSeco = true; else hasHumedo = true }
      if (hasSeco && hasHumedo) break
    }
    if (hasSeco && !hasHumedo) return ['SECO']
    if (hasHumedo && !hasSeco) return ['HUMEDO']
    return ['SECO', 'HUMEDO']
  }

  const partidaRows = partidas.map((p) => {
    const cat = findCategoriaForPartida(p.name)
    const soloHumedo = (!!cat && 'single' in cat && cat.single === 'sanitario') || SOLO_HUMEDO_FORZADO.has(normalize(p.name))
    return { ...p, applicableTipos: soloHumedo ? (['HUMEDO'] as TipoModulo[]) : computeApplicableTipos(p.rowData) }
  })

  return columns.map((col): ObraCrModuloRow => {
    const estados: Record<string, ChipEstado> = {}
    for (const pr of partidaRows) {
      if (!pr.applicableTipos.includes(col.tipo)) {
        estados[pr.name] = 'na'
        continue
      }
      estados[pr.name] = tieneValor(pr.rowData[col.colIdx]) ? 'ok' : 'no'
    }
    return { moduloNum: col.num, code: col.code, tipo: col.tipo, estados, terminado: esTerminado(col) }
  })
}

export function parseCR(wb: WorkBook, XLSX: XLSXLib): ParseCRResult {
  if (wb.Sheets['CR']) return { formato: 'cr', rows: parseHojaCR(XLSX, wb.Sheets['CR']) }
  const hojasEdificio = wb.SheetNames.filter((n) => normalize(n).startsWith('edificio'))
  if (hojasEdificio.length) return { formato: 'edificios', rows: parseEdificios(XLSX, wb, hojasEdificio) }
  throw new Error('No se encontró la hoja "CR" ni hojas "Edificio N°…" en el archivo.')
}

// Portado de parseCR() en dashboard_avance_la_chacra_10.html — misma hoja "CR",
// mismo layout de columnas (fila 18 = serie 228-xx/230-xx, fila 21-85 = partidas
// desde col B). A diferencia del html, acá NO se lee la fila 19 (equipo W/C):
// esa asignación ahora vive en obra_cr_config, cargada a mano en la pestaña
// Configuración en vez de venir del Excel de Entrega Contratistas.
function parseHojaCR(XLSX: XLSXLib, sheet: WorkSheet): ObraCrModuloRow[] {
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][]

  const ROW18 = data[17] || []
  const ROW20 = data[19] || [] // fila 20 = "RF"/"R1" por módulo cuando ya está terminado (recepción)
  const ROW54 = data[53] || []

  const columns: Col[] = []
  for (let c = 9; c < Math.max(ROW18.length, ROW54.length); c++) {
    const raw = ROW18[c] !== null && ROW18[c] !== undefined ? ROW18[c] : ROW54[c]
    if (!raw) continue
    const m = String(raw).trim().match(/^(228|230)-(\d+)$/)
    if (!m) continue
    const num = parseInt(m[2], 10)
    if (num === 0) continue
    const tipo = m[1] === '228' ? 'SECO' : 'HUMEDO'
    columns.push({ colIdx: c, num, tipo, code: codigoModulo(num) })
  }
  if (!columns.length) throw new Error('No se encontraron columnas de módulo (228-xx / 230-xx) en la fila 18 de la hoja "CR".')

  const partidas: PartidaRow[] = []
  for (let r = 20; r <= 84; r++) {
    const row = data[r]
    if (!row) continue
    const name = row[1]
    if (!name || typeof name !== 'string') continue
    if (!findCategoriaForPartida(name)) continue
    partidas.push({ name: name.trim(), rowData: row })
  }
  if (!partidas.length) throw new Error('No se encontraron partidas reconocidas (filas 21-85, columna B) en la hoja "CR".')

  // Solo "RF" (Recepción Final) oculta el módulo de las vistas activas. "R1" es
  // una recepción intermedia — el módulo sigue en curso y debe seguir apareciendo
  // (Por Contratista/Vista General/Configuración) hasta que llegue a RF.
  return armarModulos(columns, partidas, (col) => String(ROW20[col.colIdx] ?? '').trim().toUpperCase() === 'RF')
}

// Formato por edificios ("CR - Tecno Panel dd-mm-aaaa.xlsx"): una hoja por edificio con
//   - fila de encabezado = número de módulo (225, 226, …) desde la col B
//   - fila siguiente = avance "total/hechas" por módulo (23/xx seco, 45/xx húmedo)
//   - debajo, una fila por partida con el nombre en la col A (los títulos de grupo sin
//     datos se ignoran solos porque no calzan con ninguna partida conocida).
// El tipo no viene escrito por módulo: el total de partidas mayor es HUMEDO y el menor SECO.
// Terminado = módulo marcado "RF" en la hoja "Compromisos" (ver modulosConRF).
function parseEdificios(XLSX: XLSXLib, wb: WorkBook, hojas: string[]): ObraCrModuloRow[] {
  const columns: (Col & { total: number })[] = []
  const partidas = new Map<string, unknown[]>()

  for (const hoja of hojas) {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: null, raw: true }) as unknown[][]
    const filaAvance = data.findIndex((row) => (row ?? []).some((v) => /^\d+\s*\/\s*\d+$/.test(String(v ?? '').trim())))
    if (filaAvance < 1) throw new Error(`Hoja "${hoja}": no se encontró la fila de avance por módulo (ej. "23/20").`)
    const encabezado = data[filaAvance - 1] ?? []
    const avance = data[filaAvance]

    const locales: { c: number; g: number }[] = []
    for (let c = 1; c < encabezado.length; c++) {
      const num = Number(String(encabezado[c] ?? '').trim())
      const m = String(avance[c] ?? '').trim().match(/^(\d+)\s*\/\s*\d+$/)
      if (!Number.isInteger(num) || num <= 0 || !m) continue
      if (columns.some((col) => col.num === num)) throw new Error(`El módulo ${num} aparece más de una vez (hoja "${hoja}").`)
      const g = columns.length
      columns.push({ colIdx: g, num, tipo: 'SECO', code: codigoModulo(num), total: parseInt(m[1], 10) })
      locales.push({ c, g })
    }
    if (!locales.length) throw new Error(`Hoja "${hoja}": no se encontraron columnas de módulo en la fila ${filaAvance}.`)

    for (let r = filaAvance + 1; r < data.length; r++) {
      const row = data[r]
      const name = row?.[0]
      if (!name || typeof name !== 'string' || !findCategoriaForPartida(name)) continue
      const key = name.trim()
      const rowData = partidas.get(key) ?? []
      for (const { c, g } of locales) rowData[g] = row[c]
      partidas.set(key, rowData)
    }
  }

  const totales = [...new Set(columns.map((c) => c.total))]
  if (totales.length !== 2) {
    throw new Error(`No se pudo distinguir módulos SECO/HÚMEDO: se esperaban 2 totales de partidas distintos en la fila de avance y hay ${totales.length} (${totales.join(', ')}).`)
  }
  const totalHumedo = Math.max(...totales)
  for (const col of columns) col.tipo = col.total === totalHumedo ? 'HUMEDO' : 'SECO'

  if (!partidas.size) throw new Error('No se encontraron partidas reconocidas (columna A) en las hojas "Edificio".')

  const conRF = modulosConRF(XLSX, wb)
  return armarModulos(columns, [...partidas].map(([name, rowData]) => ({ name, rowData })), (col) => conRF.has(col.num))
}

// Hoja "Compromisos": bloques por día con celdas "242 H  (W)" y, en la celda de abajo,
// el resultado (1/0, o "R1"/"RF" cuando hubo recepción). Solo "RF" cuenta como terminado.
function modulosConRF(XLSX: XLSXLib, wb: WorkBook): Set<number> {
  const nombre = wb.SheetNames.find((n) => normalize(n) === 'compromisos')
  const conRF = new Set<number>()
  if (!nombre) return conRF
  const data = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: null, raw: true }) as unknown[][]
  for (let r = 0; r < data.length - 1; r++) {
    const row = data[r] ?? []
    for (let c = 0; c < row.length; c++) {
      const m = String(row[c] ?? '').trim().match(/^(\d+)\s*[HS]\b/i)
      if (m && String(data[r + 1]?.[c] ?? '').trim().toUpperCase() === 'RF') conRF.add(parseInt(m[1], 10))
    }
  }
  return conRF
}

export interface SeedResult {
  nuevos: number
  actualizados: number
}

const LOTE = 500

// Mismo criterio que seedPlantaModulos: el CR es la única fuente del checklist
// obra_cr_modulos.estados — cada re-subida reemplaza todo, sin UI propia para
// editar el checklist a mano. Con conservarTerminado un módulo ya terminado sigue
// terminado aunque el archivo no lo marque: en el formato por edificios el "RF" sale
// de la hoja Compromisos, que solo trae los últimos días.
export async function seedObraCrModulos(proyectoId: string, rows: ObraCrModuloRow[], conservarTerminado = false): Promise<SeedResult> {
  const { data: existentes, error: selError } = await supabase
    .from('obra_cr_modulos')
    .select('modulo_num, terminado')
    .eq('proyecto_id', proyectoId)
  if (selError) throw new Error(selError.message)

  const terminadoExistente = new Map((existentes ?? []).map((r) => [r.modulo_num as number, !!r.terminado]))
  const nuevos = rows.filter((r) => !terminadoExistente.has(r.moduloNum)).length
  const actualizados = rows.length - nuevos

  const payload = rows.map((r) => ({
    proyecto_id: proyectoId,
    modulo_num: r.moduloNum,
    code: r.code,
    tipo: r.tipo,
    estados: r.estados,
    terminado: r.terminado || (conservarTerminado && terminadoExistente.get(r.moduloNum) === true),
    activo: true,
    actualizado_at: new Date().toISOString(),
  }))

  for (let i = 0; i < payload.length; i += LOTE) {
    const { error } = await supabase
      .from('obra_cr_modulos')
      .upsert(payload.slice(i, i + LOTE), { onConflict: 'proyecto_id,modulo_num' })
    if (error) throw new Error(error.message)
  }

  return { nuevos, actualizados }
}

export { CATEGORY_DEFS }
