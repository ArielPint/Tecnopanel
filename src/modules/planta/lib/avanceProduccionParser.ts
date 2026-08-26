import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabaseClient'

export type Subcontrato = 'WEDO' | 'CONBES'

export interface AvanceProduccionRow {
  nombre: string
  torre: string
  tipo: string
  estadoModulo: string
  estados: Record<string, string>
  subcontrato?: Subcontrato
}

// Hoja "SUBCONTRATO" (agregada 2026-08-26): N° MÓDULO / N° SERIE / SUBCONTRATO,
// solo WEDO o CONBES. Opcional — archivos viejos sin esta hoja siguen andando igual.
function parseSubcontratoSheet(wb: XLSX.WorkBook): Map<string, Subcontrato> {
  const map = new Map<string, Subcontrato>()
  const ws = wb.Sheets['SUBCONTRATO']
  if (!ws) return map
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  for (let i = 1; i < rows.length; i++) {
    const modulo = String(rows[i][0] ?? '').trim()
    const valor = String(rows[i][2] ?? '').trim().toUpperCase()
    if (!modulo || (valor !== 'WEDO' && valor !== 'CONBES')) continue
    map.set(modulo, valor)
  }
  return map
}

// Código de partida (lib/partidas.ts) → columna "check" de la hoja BD_AVANCE de
// avance.xlsx. BD_AVANCE trae 2 bloques de columnas por partida: el primero es el
// % de aporte fijo (peso estático de esa partida en su categoría, no indica si está
// hecha) y el segundo —Excel le agrega un sufijo numérico por columna duplicada,
// ej. "PISO2", "OSB CUBIERTA3"— es 100% si la partida está aprobada y 0% si está
// pendiente; ese segundo bloque es el que se usa acá. Partidas del catálogo de la
// app sin columna equivalente clara en este Excel (Lavadero, Revestimiento Cocina-
// Logia, Puertas —el Excel la separa en Acceso/Logia/Baño y Dormitorio—,
// Extractores, Termopaneles, Cornizas, Endolados, Ventilaciones Pasivas, Recepción
// Final) quedan sin mapear: no se marcan aprobadas aunque lo estén en el Excel, y
// siguen apareciendo como pendientes en la app hasta que se carguen manualmente o
// el Excel exponga esas columnas con nombres reconocibles.
const CODE_TO_CHECK_COLUMN: Record<string, string> = {
  'OG.01': 'PISO2',
  'OG.02': 'TABIQUES2',
  'OG.03': 'MUROS2',
  'OG.04': 'CIELO2',
  'OG.05': 'BALCÓN2',
  'SA.01': 'RED ALCANTARILLADO2',
  'SA.02': 'RED DE AGUA2',
  'SA.03': 'TINA2',
  'SA.04': 'WC2',
  'SA.05': 'LAVAMANOS / LAVAPLATOS / LAVADERO2',
  'EL.01': 'CANALIZACIÓN2',
  'EL.02': 'CABLEADO2',
  'EL.03': 'ARTEFACTOS2',
  'EL.04': 'TABLERO2',
  'EL.05': 'CAJA PAU2',
  'TE.01': 'OSB CUBIERTA3',
  'TE.02': 'OSB EXTERIOR5',
  'TE.04': 'IMPERMEABILIZACION BANO - COCINA LOGIA22',
  'TE.05': 'REVESTIMIENTO INTERIOR ZONA SECA15',
  'TE.07': 'REVESTIMIENTO INTERIOR BANO20',
  'TE.08': 'INSTALACION VINILICO2',
  'TE.09': 'MUEBLE LAVAPLATOS21',
  'TE.10': 'VENTANAS12',
  'TE.15': 'PILASTREO10',
  'TE.17': 'CELOSIAS11',
  'TE.18': 'BARANDA BALCON4',
  'TE.19': 'SMART PANEL6',
  'TE.20': 'PINTURA EXTERIOR7',
}

// Columna check: 100% hecha o 0% pendiente, sin valores intermedios. XLSX puede
// devolver el valor crudo como fracción (1 = 100%) o como texto formateado ("100.00%")
// según las opciones de parseo — 0.5 como corte cubre ambas representaciones.
function esDone(v: unknown): boolean {
  const n = parseFloat(String(v).replace('%', '').trim())
  return !isNaN(n) && n >= 0.5
}

export function parseAvanceProduccion(wb: XLSX.WorkBook): AvanceProduccionRow[] {
  const sheetName = wb.SheetNames.includes('BD_AVANCE')
    ? 'BD_AVANCE'
    : (wb.SheetNames.find((n) => /AVANCE/i.test(n)) ?? wb.SheetNames[0])
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  if (!rows.length) throw new Error(`La hoja "${sheetName}" está vacía.`)

  const hdr = rows[0].map((c) => String(c).trim())
  const col = (name: string) => hdr.indexOf(name)
  const iModulo = col('N° MÓDULO')
  const iTorre = col('TORRE')
  const iTipo = col('TIPO')
  const iEstado = col('ESTADO MODULO')
  if (iModulo < 0) {
    throw new Error(`No se encontró la columna "N° MÓDULO" en la hoja "${sheetName}" — revisá el encabezado del archivo.`)
  }

  const checkCols = Object.entries(CODE_TO_CHECK_COLUMN).map(([code, colName]) => ({ code, idx: col(colName) }))
  const subcontratoPorModulo = parseSubcontratoSheet(wb)

  const out: AvanceProduccionRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const nombre = String(r[iModulo] ?? '').trim()
    if (!nombre) continue
    const estados: Record<string, string> = {}
    for (const { code, idx } of checkCols) {
      if (idx < 0) continue
      if (esDone(r[idx])) estados[code] = 'aprobado'
    }
    out.push({
      nombre,
      torre: iTorre >= 0 ? String(r[iTorre] ?? '').trim() : '',
      tipo: iTipo >= 0 ? String(r[iTipo] ?? '').trim() || 'N/A' : 'N/A',
      estadoModulo: iEstado >= 0 ? String(r[iEstado] ?? '').trim() : '',
      estados,
      subcontrato: subcontratoPorModulo.get(nombre),
    })
  }
  return out
}

export interface SeedResult {
  nuevos: number
  actualizados: number
}

// El Excel de avance es la única fuente de estados/torre/tipo de planta_modulos —
// la app no tiene UI propia para editar el checklist a mano, así que cada
// re-subida refresca todo sin riesgo de pisar progreso cargado manualmente.
// Un solo upsert en lote (constraint única proyecto_id+nombre) en vez de un
// insert/update por fila — 700+ requests secuenciales tardaban minutos.
const LOTE = 500

export async function seedPlantaModulos(proyectoId: string, rows: AvanceProduccionRow[]): Promise<SeedResult> {
  const { data: existentes, error: selError } = await supabase
    .from('planta_modulos')
    .select('nombre')
    .eq('proyecto_id', proyectoId)
  if (selError) throw new Error(selError.message)

  const nombresExistentes = new Set((existentes ?? []).map((r) => r.nombre))
  const nuevos = rows.filter((r) => !nombresExistentes.has(r.nombre)).length
  const actualizados = rows.length - nuevos

  const payload = rows.map((r) => ({
    proyecto_id: proyectoId,
    nombre: r.nombre,
    torre: r.torre,
    tipo: r.tipo,
    estado_modulo: r.estadoModulo,
    estados: r.estados,
    activo: true,
  }))

  for (let i = 0; i < payload.length; i += LOTE) {
    const { error } = await supabase
      .from('planta_modulos')
      .upsert(payload.slice(i, i + LOTE), { onConflict: 'proyecto_id,nombre' })
    if (error) throw new Error(error.message)
  }

  // subcontrato va en un upsert aparte, con un payload que SOLO trae esa columna —
  // así el "columns" que arma postgrest para este request no incluye torre/tipo/estados/etc,
  // y el merge no puede pisarlos. Probado: meter subcontrato en el payload de arriba (aunque
  // sea con defaultToNull:false) SÍ pisaba con null los módulos sin valor en el Excel — esa
  // opción solo protege el camino de INSERT, no el UPDATE de un conflicto (doc de postgrest-js).
  const conSubcontrato = rows.filter((r) => r.subcontrato)
  const payloadSub = conSubcontrato.map((r) => ({ proyecto_id: proyectoId, nombre: r.nombre, subcontrato: r.subcontrato }))
  for (let i = 0; i < payloadSub.length; i += LOTE) {
    const { error } = await supabase
      .from('planta_modulos')
      .upsert(payloadSub.slice(i, i + LOTE), { onConflict: 'proyecto_id,nombre' })
    if (error) throw new Error(error.message)
  }

  return { nuevos, actualizados }
}
