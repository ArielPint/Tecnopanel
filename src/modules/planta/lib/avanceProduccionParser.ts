import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabaseClient'
import { ALL_PARTIDAS } from './partidas'

export interface AvanceProduccionRow {
  nombre: string
  torre: string
  tipo: string
  estados: Record<string, string>
}

const PARTIDA_CODES = new Set(ALL_PARTIDAS.map((p) => p.c.toUpperCase()))
const VACIO = new Set(['', '0', 'NO', 'PENDIENTE', 'N/A', 'NA'])

// Detección de encabezado flexible (mismo patrón que logistica/lib/catalogoModulos.ts) —
// no hay una muestra real del Excel de avance/partidas del usuario todavía, así que si no
// se identifica con confianza la columna de módulo se corta con un error claro en vez de
// importar datos incorrectos.
export function parseAvanceProduccion(wb: XLSX.WorkBook): AvanceProduccionRow[] {
  const sheetName = wb.SheetNames.find((n) => /AVANCE|PRODUCCION|PARTIDA/i.test(n)) ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]

  let hi = rows.findIndex((r) => r.some((c) => /M[ÓO]DULO/i.test(String(c))))
  if (hi < 0) hi = 0
  const hdr = rows[hi].map((c) => String(c).trim().toUpperCase())
  const ci = (name: string) => hdr.findIndex((h) => h.includes(name))
  const iM = ci('MÓDULO') >= 0 ? ci('MÓDULO') : ci('MODULO')
  const iT = ci('TORRE')
  const iTp = ci('TIPO')
  if (iM < 0) {
    throw new Error(`No se encontró la columna "Módulo" en la hoja "${sheetName}" — revisá el encabezado del archivo.`)
  }

  // Columnas cuyo encabezado matchea un código de partida conocido (OG.01, EL.03, ...) —
  // si el Excel no las trae, estados queda vacío y el detalle por partida sigue siendo manual.
  const partidaCols = hdr
    .map((h, i) => ({ code: h.replace(/\s+/g, ''), i }))
    .filter((c) => PARTIDA_CODES.has(c.code))

  const out: AvanceProduccionRow[] = []
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]
    const nombre = String(r[iM] ?? '').trim()
    if (!nombre) continue
    const estados: Record<string, string> = {}
    for (const { code, i: colIdx } of partidaCols) {
      const v = String(r[colIdx] ?? '').trim().toUpperCase()
      if (!VACIO.has(v)) estados[code] = 'aprobado'
    }
    out.push({
      nombre,
      torre: iT >= 0 ? String(r[iT] ?? '').trim() : '',
      tipo: iTp >= 0 ? String(r[iTp] ?? '').trim() || 'N/A' : 'N/A',
      estados,
    })
  }
  return out
}

export interface SeedResult {
  nuevos: number
  actualizados: number
}

// Inserta módulos nuevos (con estados si el Excel traía columnas de partidas) y solo
// refresca torre/tipo de los ya existentes — nunca pisa el checklist manual ya cargado.
export async function seedPlantaModulos(proyectoId: string, rows: AvanceProduccionRow[]): Promise<SeedResult> {
  const { data: existentes, error: selError } = await supabase
    .from('planta_modulos')
    .select('id, nombre')
    .eq('proyecto_id', proyectoId)
  if (selError) throw new Error(selError.message)

  const idPorNombre = new Map((existentes ?? []).map((r) => [r.nombre, r.id as string]))
  const nuevos = rows.filter((r) => !idPorNombre.has(r.nombre))
  const paraActualizar = rows.filter((r) => idPorNombre.has(r.nombre))

  if (nuevos.length) {
    const { error } = await supabase.from('planta_modulos').insert(
      nuevos.map((r) => ({
        proyecto_id: proyectoId,
        nombre: r.nombre,
        torre: r.torre,
        tipo: r.tipo,
        estado_modulo: '',
        estados: r.estados,
        tiempos: {},
        observaciones: {},
        activo: true,
      })),
    )
    if (error) throw new Error(error.message)
  }

  for (const r of paraActualizar) {
    const { error } = await supabase
      .from('planta_modulos')
      .update({ torre: r.torre, tipo: r.tipo })
      .eq('id', idPorNombre.get(r.nombre)!)
    if (error) throw new Error(error.message)
  }

  return { nuevos: nuevos.length, actualizados: paraActualizar.length }
}
