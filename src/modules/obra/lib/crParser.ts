import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabaseClient'
import { CATEGORY_DEFS, findCategoriaForPartida, type ObraCategoria } from './categorias'

export type ChipEstado = 'ok' | 'no' | 'na'

export interface ObraCrModuloRow {
  moduloNum: number
  code: string
  tipo: 'SECO' | 'HUMEDO'
  // clave = nombre crudo de la partida (tal cual columna B del CR)
  estados: Record<string, ChipEstado>
  terminado: boolean
}

// Portado de parseCR() en dashboard_avance_la_chacra_10.html — misma hoja "CR",
// mismo layout de columnas (fila 18 = serie 228-xx/230-xx, fila 21-85 = partidas
// desde col B). A diferencia del html, acá NO se lee la fila 19 (equipo W/C):
// esa asignación ahora vive en obra_cr_config, cargada a mano en la pestaña
// Configuración en vez de venir del Excel de Entrega Contratistas.
export function parseCR(wb: XLSX.WorkBook): ObraCrModuloRow[] {
  const sheet = wb.Sheets['CR']
  if (!sheet) throw new Error('No se encontró la hoja "CR" en el archivo.')
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][]

  const ROW18 = data[17] || []
  const ROW20 = data[19] || [] // fila 20 = "RF"/"R1" por módulo cuando ya está terminado (recepción)
  const ROW54 = data[53] || []

  interface Col { colIdx: number; num: number; tipo: 'SECO' | 'HUMEDO'; code: string }
  const columns: Col[] = []
  for (let c = 9; c < Math.max(ROW18.length, ROW54.length); c++) {
    const raw = ROW18[c] !== null && ROW18[c] !== undefined ? ROW18[c] : ROW54[c]
    if (!raw) continue
    const m = String(raw).trim().match(/^(228|230)-(\d+)$/)
    if (!m) continue
    const num = parseInt(m[2], 10)
    if (num === 0) continue
    const tipo = m[1] === '228' ? 'SECO' : 'HUMEDO'
    columns.push({ colIdx: c, num, tipo, code: 'M-' + String(num).padStart(5, '0') })
  }
  if (!columns.length) throw new Error('No se encontraron columnas de módulo (228-xx / 230-xx) en la fila 18 de la hoja "CR".')

  function computeApplicableTipos(rowData: unknown[]): ('SECO' | 'HUMEDO')[] {
    let hasSeco = false
    let hasHumedo = false
    for (const col of columns) {
      const v = rowData[col.colIdx]
      const ok = v !== null && v !== undefined && String(v).trim() !== ''
      if (ok) { if (col.tipo === 'SECO') hasSeco = true; else hasHumedo = true }
      if (hasSeco && hasHumedo) break
    }
    if (hasSeco && !hasHumedo) return ['SECO']
    if (hasHumedo && !hasSeco) return ['HUMEDO']
    return ['SECO', 'HUMEDO']
  }

  interface PartidaRow { name: string; category: { single: ObraCategoria } | { wedoConbes: true }; rowData: unknown[]; applicableTipos: ('SECO' | 'HUMEDO')[] }
  const partidaRows: PartidaRow[] = []
  for (let r = 20; r <= 84; r++) {
    const row = data[r]
    if (!row) continue
    const name = row[1]
    if (!name || typeof name !== 'string') continue
    const cat = findCategoriaForPartida(name)
    if (!cat) continue
    partidaRows.push({ name: name.trim(), category: cat, rowData: row, applicableTipos: computeApplicableTipos(row) })
  }
  if (!partidaRows.length) throw new Error('No se encontraron partidas reconocidas (filas 21-85, columna B) en la hoja "CR".')

  return columns.map((col): ObraCrModuloRow => {
    const estados: Record<string, ChipEstado> = {}
    for (const pr of partidaRows) {
      if (!pr.applicableTipos.includes(col.tipo)) {
        estados[pr.name] = 'na'
        continue
      }
      const val = pr.rowData[col.colIdx]
      const ok = val !== null && val !== undefined && String(val).trim() !== ''
      estados[pr.name] = ok ? 'ok' : 'no'
    }
    // Solo "RF" (Recepción Final) oculta el módulo de las vistas activas. "R1" es
    // una recepción intermedia — el módulo sigue en curso y debe seguir apareciendo
    // (Por Contratista/Vista General/Configuración) hasta que llegue a RF.
    const marcaFila20 = String(ROW20[col.colIdx] ?? '').trim().toUpperCase()
    const terminado = marcaFila20 === 'RF'
    return { moduloNum: col.num, code: col.code, tipo: col.tipo, estados, terminado }
  })
}

export interface SeedResult {
  nuevos: number
  actualizados: number
}

const LOTE = 500

// Mismo criterio que seedPlantaModulos: el CR es la única fuente del checklist
// obra_cr_modulos.estados — cada re-subida reemplaza todo, sin UI propia para
// editar el checklist a mano.
export async function seedObraCrModulos(proyectoId: string, rows: ObraCrModuloRow[]): Promise<SeedResult> {
  const { data: existentes, error: selError } = await supabase
    .from('obra_cr_modulos')
    .select('modulo_num')
    .eq('proyecto_id', proyectoId)
  if (selError) throw new Error(selError.message)

  const numsExistentes = new Set((existentes ?? []).map((r) => r.modulo_num))
  const nuevos = rows.filter((r) => !numsExistentes.has(r.moduloNum)).length
  const actualizados = rows.length - nuevos

  const payload = rows.map((r) => ({
    proyecto_id: proyectoId,
    modulo_num: r.moduloNum,
    code: r.code,
    tipo: r.tipo,
    estados: r.estados,
    terminado: r.terminado,
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
