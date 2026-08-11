import { supabase, unwrap } from '@/lib/supabaseClient'
import type { DetalleGdRow } from './excelParser'

export async function loadPresupuestoTotal(): Promise<number | null> {
  const data = await unwrap(supabase.from('config').select('value').eq('key', 'presupuesto_total').maybeSingle())
  return data?.value != null ? parseFloat(data.value) || null : null
}

// Catálogo de ppto vigente por código — resuelto en vivo contra productos_custom,
// igual que registro-gd.html (reemplaza el precio "foto" guardado en registro_compras.valor_ppto).
export async function loadPptoCatalogo(): Promise<Record<string, number>> {
  const data = await unwrap(supabase.from('productos_custom').select('codigo, ppto').eq('activo', true))
  const map: Record<string, number> = {}
  for (const p of data ?? []) {
    if (p.codigo && p.ppto != null) map[String(p.codigo).trim().toUpperCase()] = parseFloat(p.ppto) || 0
  }
  return map
}

interface RegistroCompraRow {
  id: string
  fecha_guia: string | null
  fecha_sol: string | null
  mes: number | null
  gd: string | null
  codigo: string | null
  descripcion: string | null
  cantidad_sol: string | number | null
  devolucion: string | number | null
  valor_und: string | number | null
  valor_ppto: string | number | null
  valor_total_item: string | number | null
  responsable: string | null
  oc: string | null
  tipo_producto: string | null
}

// Normaliza registro_compras + ajustes_compras al shape de DetalleGdRow (detalleGD del Excel),
// para que getCompras() pueda tratar ambas fuentes igual — mismo criterio que dashboard.html.
export async function loadCompras(proyectoId: string): Promise<DetalleGdRow[]> {
  const PAGE = 1000
  const all: RegistroCompraRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('registro_compras')
      .select('id, fecha_guia, fecha_sol, mes, gd, codigo, descripcion, cantidad_sol, devolucion, valor_und, valor_ppto, valor_total_item, responsable, oc, tipo_producto')
      .eq('proyecto_id', proyectoId)
      .order('fecha_guia', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data) break
    all.push(...(data as RegistroCompraRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  const montoGDMap: Record<string, number> = {}
  for (const r of all) {
    const cantRec = (parseFloat(String(r.cantidad_sol)) || 0) - (parseFloat(String(r.devolucion)) || 0)
    const vti =
      r.valor_total_item != null && r.valor_total_item !== ''
        ? parseFloat(String(r.valor_total_item)) || 0
        : (parseFloat(String(r.valor_und)) || 0) * cantRec
    const key = String(r.gd ?? '')
    montoGDMap[key] = (montoGDMap[key] || 0) + vti
  }

  const filas: DetalleGdRow[] = all.map((r) => {
    const cantRec = (parseFloat(String(r.cantidad_sol)) || 0) - (parseFloat(String(r.devolucion)) || 0)
    const valorTotal =
      r.valor_total_item != null && r.valor_total_item !== ''
        ? parseFloat(String(r.valor_total_item)) || 0
        : (parseFloat(String(r.valor_und)) || 0) * cantRec
    const valorUN = cantRec ? valorTotal / cantRec : 0
    const valorPpto = parseFloat(String(r.valor_ppto)) || 0
    const difTotal = cantRec * valorPpto - valorTotal
    const base = cantRec * valorPpto
    const fechaAgr = r.fecha_guia || r.fecha_sol
    const fd = fechaAgr ? new Date(fechaAgr + 'T12:00:00') : null
    return {
      fechaGuia: r.fecha_guia, anioGuia: fd ? fd.getFullYear() : null,
      mes: fd ? fd.getMonth() + 1 : r.mes, codigo: r.codigo, desc: r.descripcion,
      um: null, cant: parseFloat(String(r.cantidad_sol)) || 0, cantRec,
      valorUN, valorItem: valorTotal, valorTotal,
      valorPpto, difUN: valorPpto - valorUN, difTotal,
      difPct: base ? difTotal / base : null,
      gd: r.gd, responsable: r.responsable, montoGD: montoGDMap[String(r.gd ?? '')] || 0,
      oc: r.oc, presupuesto: null, totalPpto: cantRec * valorPpto,
      tipoProd: r.tipo_producto,
    }
  })

  const ajustes = await unwrap(supabase.from('ajustes_compras').select('anio, mes, valor, concepto').eq('proyecto_id', proyectoId))
  for (const a of ajustes ?? []) {
    const valor = parseFloat(String(a.valor)) || 0
    if (!valor) continue
    filas.push({
      fechaGuia: null, anioGuia: a.anio, mes: a.mes, codigo: null, desc: a.concepto || 'Ajuste manual',
      um: null, cant: 0, cantRec: 0, valorUN: 0, valorItem: valor, valorTotal: valor,
      valorPpto: 0, difUN: 0, difTotal: 0, difPct: null,
      gd: null, responsable: null, montoGD: 0, oc: null, presupuesto: null, totalPpto: 0,
      tipoProd: 'Ajuste',
    })
  }

  return filas
}

export async function loadModulosDespachadosCount(proyectoId: string): Promise<number> {
  const data = await unwrap(supabase.from('despachos_gd').select('modulo').eq('proyecto_id', proyectoId))
  return new Set((data ?? []).map((r) => r.modulo).filter(Boolean)).size
}

export interface DespachoSupaRow {
  fecha: string | null
  gd: string | null
  serie: string | null
  cant: number | null
  monto: number | null
  modulo: string | null
  torre: string | null
  tipo: string | null
}

export async function loadDespachos(proyectoId: string): Promise<DespachoSupaRow[]> {
  const data = await unwrap(
    supabase
      .from('despachos_gd')
      .select('fecha_despacho, gd_numero, modulo_nro_serie, cantidad, monto_neto, modulo, torre, tipo')
      .eq('proyecto_id', proyectoId)
      .order('fecha_gd', { ascending: true }),
  )
  return (data ?? []).map((r) => ({
    fecha: r.fecha_despacho, gd: r.gd_numero, serie: r.modulo_nro_serie,
    cant: r.cantidad != null ? parseFloat(r.cantidad) : null,
    monto: r.monto_neto != null ? parseFloat(r.monto_neto) : null,
    modulo: r.modulo, torre: r.torre, tipo: r.tipo,
  }))
}

export interface AvanceEconProyRow {
  anio: number
  mes: number
  valor: string | number
  forecast: string
}

export async function loadAvanceEconProy(anio: number): Promise<AvanceEconProyRow[]> {
  const data = await unwrap(
    supabase
      .from('avance_econ_proy')
      .select('anio, mes, valor, forecast')
      .eq('anio', anio)
      .order('created_at', { ascending: true })
      .order('mes', { ascending: true }),
  )
  return (data ?? []) as AvanceEconProyRow[]
}

export interface RegistroStockRow {
  fecha: string
  semana_key: string
  codigo: string
  material: string
  unidad: string | null
  stock_fisico: string | number
}

export async function loadRegistroStock(proyectoId: string): Promise<RegistroStockRow[]> {
  const data = await unwrap(
    supabase
      .from('registro_stock')
      .select('fecha, semana_key, codigo, material, unidad, stock_fisico')
      .eq('proyecto_id', proyectoId)
      .order('semana_key', { ascending: false })
      .order('material', { ascending: true }),
  )
  return (data ?? []) as RegistroStockRow[]
}

export interface RitmoProyeccion {
  ritmoTope: number
  ritmoTorre3: number
}

// Defaults iguales a dashboard.html si faltan las keys en config
export async function loadRitmoProyeccion(): Promise<RitmoProyeccion> {
  const data = await unwrap(supabase.from('config').select('key, value').in('key', ['proy_ritmo_tope', 'proy_ritmo_torre3_fijo']))
  let ritmoTope = 15
  let ritmoTorre3 = 6
  for (const r of data ?? []) {
    if (r.key === 'proy_ritmo_tope' && r.value) ritmoTope = parseFloat(r.value) || ritmoTope
    if (r.key === 'proy_ritmo_torre3_fijo' && r.value) ritmoTorre3 = parseFloat(r.value) || ritmoTorre3
  }
  return { ritmoTope, ritmoTorre3 }
}

export interface PlantaModuloProdRow {
  nombre: string | null
  torre: string | null
  tipo: string | null
  estados: Record<string, unknown> | null
  tiempos: Record<string, { t3?: string }> | null
}

export async function loadPlantaModulosProdDiaria(proyectoId: string): Promise<PlantaModuloProdRow[]> {
  const data = await unwrap(
    supabase
      .from('planta_modulos')
      .select('nombre, torre, tipo, estados, tiempos')
      .eq('proyecto_id', proyectoId)
      .order('orden', { ascending: true }),
  )
  return (data ?? []) as PlantaModuloProdRow[]
}

export interface PlantaModuloRow {
  nombre: string | null
  torre: string | null
  tipo: string | null
  estado_modulo: string | null
  estados: Record<string, unknown> | null
  tiempos: Record<string, { t1?: string; t2?: string; t3?: string }> | null
}

// Set completo de columnas para el módulo Producción (Resumen/Torres/Partidas/Alertas/Detalle) —
// separado de loadPlantaModulosProdDiaria (que solo necesita 5 columnas) para no cambiarle el shape.
export async function loadPlantaModulos(proyectoId: string): Promise<PlantaModuloRow[]> {
  const data = await unwrap(
    supabase
      .from('planta_modulos')
      .select('nombre, torre, tipo, estado_modulo, estados, tiempos')
      .eq('proyecto_id', proyectoId)
      .order('orden', { ascending: true }),
  )
  return (data ?? []) as PlantaModuloRow[]
}
