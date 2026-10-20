import type { WorkBook } from 'xlsx'
import type { XLSXLib } from '@/lib/cargarLibrerias'
import { supabase } from '@/lib/supabaseClient'

export interface StockRow {
  codigo: string
  descripcion: string
  unidad: string
  cantidad: number
}

export interface StockParseado {
  hoja: string
  rows: StockRow[]
}

// El export de SAP trae una hoja por fecha de corte ("dd-mm-aaaa"); se usa la más reciente.
const HOJA_FECHA = /^(\d{2})-(\d{2})-(\d{4})$/

// Columnas por posición; el texto exacto del encabezado varía entre exportaciones
// ("Unidad de medida" / "Unidad de medida de inventario"), así que se valida por palabra clave.
const COLUMNAS: { letra: string; esperado: string; claves: string[] }[] = [
  { letra: 'A', esperado: 'Número de artículo', claves: ['numero', 'codigo'] },
  { letra: 'B', esperado: 'Descripción del artículo', claves: ['descripcion'] },
  { letra: 'C', esperado: 'Unidad de medida', claves: ['unidad'] },
  { letra: 'D', esperado: 'En stock', claves: ['stock', 'cantidad'] },
]

function normTexto(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function hojaMasReciente(nombres: string[]): string {
  const conFecha = nombres
    .map((n) => ({ n, m: HOJA_FECHA.exec(n.trim()) }))
    .filter((x): x is { n: string; m: RegExpExecArray } => x.m !== null)
    .map(({ n, m }) => ({ n, clave: `${m[3]}${m[2]}${m[1]}` }))
  if (!conFecha.length) {
    throw new Error(
      `Ninguna hoja tiene nombre de fecha (dd-mm-aaaa). Hojas encontradas: ${nombres.map((n) => `"${n}"`).join(', ') || 'ninguna'}.`,
    )
  }
  return conFecha.reduce((a, b) => (b.clave > a.clave ? b : a)).n
}

export function parseStock(wb: WorkBook, XLSX: XLSXLib): StockParseado {
  const hoja = hojaMasReciente(wb.SheetNames)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: null, raw: true }) as unknown[][]
  if (rows.length < 2) throw new Error(`La hoja "${hoja}" está vacía.`)

  const encabezado = rows[0] ?? []
  const errores = COLUMNAS.flatMap((c, i) => {
    const texto = normTexto(encabezado[i])
    if (c.claves.some((k) => texto.includes(k))) return []
    const actual = String(encabezado[i] ?? '').trim()
    return [`columna ${c.letra} debería ser "${c.esperado}" y dice ${actual ? `"${actual}"` : '(vacía)'}`]
  })
  if (errores.length) throw new Error(`Encabezados inválidos en la hoja "${hoja}": ${errores.join('; ')}.`)

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
  if (!out.length) throw new Error(`No se encontraron filas con código de producto en la hoja "${hoja}".`)
  return { hoja, rows: out }
}

export interface StockUpsertResult {
  nuevos: number
  actualizados: number
  sinStock: number
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

  // Lo que no viene en el archivo queda en 0 → "Sin stock".
  const { data: sinStock, error: rpcError } = await supabase.rpc('stock_marcar_ausentes', { p_codigos: rows.map((r) => r.codigo) })
  if (rpcError) throw new Error(rpcError.message)

  return { nuevos, actualizados, sinStock: (sinStock as number | null) ?? 0 }
}
