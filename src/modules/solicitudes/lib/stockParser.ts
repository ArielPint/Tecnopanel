import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabaseClient'

export interface StockRow {
  codigo: string
  descripcion: string
  unidad: string
  cantidad: number
}

// Columnas por posición (0:código, 1:descripción, 2:unidad, 3:stock) — el nombre de
// la hoja y de los encabezados varía según la fecha de exportación del Excel.
export function parseStock(wb: XLSX.WorkBook): StockRow[] {
  const sheetName = wb.SheetNames[0]
  const ws = sheetName ? wb.Sheets[sheetName] : undefined
  if (!ws) throw new Error('El archivo no tiene hojas.')
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as unknown[][]
  if (rows.length < 2) throw new Error(`La hoja "${sheetName}" está vacía.`)

  const out: StockRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const codigo = String(r[0] ?? '').trim()
    if (!codigo) continue
    out.push({
      codigo,
      descripcion: String(r[1] ?? '').trim(),
      unidad: String(r[2] ?? '').trim(),
      cantidad: parseFloat(String(r[3] ?? '0')) || 0,
    })
  }
  if (!out.length) throw new Error('No se encontraron filas con código de producto.')
  return out
}

export interface StockUpsertResult {
  nuevos: number
  actualizados: number
}

const LOTE = 500

export async function upsertStock(rows: StockRow[], userId: string): Promise<StockUpsertResult> {
  const { data: existentes, error: selError } = await supabase.from('stock_productos').select('codigo')
  if (selError) throw new Error(selError.message)

  const codigosExistentes = new Set((existentes ?? []).map((r) => r.codigo as string))
  const nuevos = rows.filter((r) => !codigosExistentes.has(r.codigo)).length
  const actualizados = rows.length - nuevos

  const ahora = new Date().toISOString()
  const payload = rows.map((r) => ({
    codigo: r.codigo,
    descripcion: r.descripcion,
    unidad: r.unidad,
    cantidad_disponible: r.cantidad,
    actualizado_en: ahora,
    actualizado_por: userId,
  }))

  for (let i = 0; i < payload.length; i += LOTE) {
    const { error } = await supabase.from('stock_productos').upsert(payload.slice(i, i + LOTE), { onConflict: 'codigo' })
    if (error) throw new Error(error.message)
  }

  return { nuevos, actualizados }
}
