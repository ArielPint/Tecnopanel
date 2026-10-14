import { supabase } from '@/lib/supabaseClient'
import type { Sucursal } from '@/lib/lineasNegocio'

// Acceso a datos del portal (migración 20261006120000_produccion_sip.sql). La RLS decide qué puede
// leer y escribir cada uno; aquí solo se arman las consultas y se traducen los errores.

/** Sucursal que se mira en los listados (migración 20261014150000): una, o las dos que vea el usuario */
export type FiltroSucursal = Sucursal | 'todas'

export interface Material {
  id: string
  codigo: string
  descripcion: string
  unidad: string
  activo: boolean
}

export interface Panel {
  id: string
  codigo: string
  descripcion: string
  ancho_mm: number | null
  largo_mm: number | null
  espesor_mm: number | null
  activo: boolean
}

export interface RecetaFila {
  panel_id: string
  material_id: string
  cantidad: number
}

export interface ParteV {
  id: string
  numero: number
  fecha: string
  hora_desde: string | null
  hora_hasta: string | null
  observacion: string | null
  created_by: string
  registrado_por: string | null
  created_at: string
  updated_by: string | null
  corregido_por: string | null
  updated_at: string
  lineas: number
  buenos: number
  rechazados: number
  m2_buenos: number
  sucursal: Sucursal
}

export interface LineaV {
  id: string
  parte_id: string
  parte_numero: number
  fecha: string
  hora_desde: string | null
  hora_hasta: string | null
  panel_id: string
  panel_codigo: string
  panel_descripcion: string
  espesor_mm: number | null
  m2_panel: number
  buenos: number
  rechazados: number
  total: number
  proyecto_id: string | null
  pnl_proyecto_id: string | null
  sap_proyecto_codigo: string | null
  /** nombre del proyecto SAP, de la obra del hub o del proyecto propio */
  proyecto_nombre: string | null
  referencia: string | null
  sucursal: Sucursal
}

export interface ConsumoV {
  linea_id: string
  parte_id: string
  fecha: string
  panel_id: string
  panel_codigo: string
  proyecto_id: string | null
  pnl_proyecto_id: string | null
  sap_proyecto_codigo: string | null
  referencia: string | null
  material_id: string
  material_codigo: string
  material_descripcion: string
  unidad: string
  cantidad_unitaria: number
  cantidad_buenos: number
  cantidad_merma: number
  cantidad_total: number
  sucursal: Sucursal
}

/** Obra del hub (tabla proyectos, como La Chacra) */
export interface Proyecto {
  id: string
  nombre: string
}

/** Proyecto propio del portal, editable en Paneles y recetas › Proyectos */
export interface ProyectoPropio {
  id: string
  nombre: string
  activo: boolean
}

export interface LineaInput {
  id?: string
  panel_id: string
  buenos: number
  rechazados: number
  proyecto_id: string | null
  pnl_proyecto_id: string | null
  sap_proyecto_codigo: string | null
  referencia: string
}

export interface FilaImportacion {
  panel_codigo: string
  panel_descripcion: string
  material_codigo: string
  material_descripcion: string
  cantidad: number
  unidad: string
}

type ErrorDb = { message: string; code?: string } | null

/** Mensaje para el usuario. Los de la base (P0001) ya vienen en español. */
export function mensajeError(error: ErrorDb | unknown): string {
  const e = error as { message?: string; code?: string } | null
  if (!e?.message) return 'Ocurrió un error inesperado'
  if (e.code === '42501' || /row-level security|seguridad de registros/i.test(e.message)) return 'No tiene permiso para esta acción'
  if (e.code === '23505') return 'Ya existe un registro con ese código o nombre'
  if (e.code === '23503') return 'No se puede: está en uso en recetas o en producción registrada. Puede desactivarlo.'
  return e.message
}

function revisar<T>({ data, error }: { data: T | null; error: ErrorDb }): T {
  if (error) throw new Error(mensajeError(error))
  return data as T
}

/** PostgREST corta en 1000 filas: trae todas, de a 1000. */
async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: ErrorDb }>): Promise<T[]> {
  const salida: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const pagina = revisar(await consulta(desde, desde + 999)) ?? []
    salida.push(...pagina)
    if (pagina.length < 1000) return salida
  }
}

const num = <T extends object>(fila: T, campos: (keyof T)[]): T => {
  const copia = { ...fila }
  for (const c of campos) copia[c] = Number(copia[c]) as T[keyof T]
  return copia
}

/** Filtra por sucursal las vistas que la traen; con 'todas', la RLS ya deja solo las que ve el usuario. */
function enSucursal<Q extends { eq: (columna: string, valor: string) => Q }>(q: Q, sucursal: FiltroSucursal): Q {
  return sucursal === 'todas' ? q : q.eq('sucursal', sucursal)
}

// ---------------------------------------------------------------- catálogo

export async function listarMateriales(): Promise<Material[]> {
  return todas((a, b) => supabase.from('pnl_materiales').select('*').order('codigo').range(a, b))
}

export async function listarPaneles(): Promise<Panel[]> {
  return todas((a, b) => supabase.from('pnl_paneles').select('*').order('codigo').range(a, b))
}

export async function listarRecetas(): Promise<RecetaFila[]> {
  const filas = await todas<RecetaFila>((a, b) => supabase.from('pnl_recetas').select('panel_id, material_id, cantidad').range(a, b))
  return filas.map((f) => num(f, ['cantidad']))
}

export async function guardarPanel(p: Omit<Panel, 'id'> & { id?: string }): Promise<string> {
  const fila = { codigo: p.codigo.trim(), descripcion: p.descripcion.trim(), ancho_mm: p.ancho_mm, largo_mm: p.largo_mm, espesor_mm: p.espesor_mm, activo: p.activo }
  if (p.id) {
    revisar(await supabase.from('pnl_paneles').update(fila).eq('id', p.id))
    return p.id
  }
  const { data, error } = await supabase.from('pnl_paneles').insert(fila).select('id').single()
  if (error || !data) throw new Error(mensajeError(error))
  return data.id as string
}

export async function eliminarPanel(id: string) {
  revisar(await supabase.from('pnl_paneles').delete().eq('id', id))
}

export async function guardarReceta(panelId: string, filas: { material_id: string; cantidad: number }[]) {
  revisar(await supabase.rpc('pnl_guardar_receta', { p_panel_id: panelId, p_filas: filas }))
}

export async function guardarMaterial(m: Omit<Material, 'id'> & { id?: string }) {
  const fila = { codigo: m.codigo.trim(), descripcion: m.descripcion.trim(), unidad: m.unidad.trim().toUpperCase(), activo: m.activo }
  if (m.id) revisar(await supabase.from('pnl_materiales').update(fila).eq('id', m.id))
  else revisar(await supabase.from('pnl_materiales').insert(fila))
}

export async function eliminarMaterial(id: string) {
  revisar(await supabase.from('pnl_materiales').delete().eq('id', id))
}

export async function importarRecetas(filas: FilaImportacion[]): Promise<{ paneles: number; materiales_nuevos: number; lineas: number }> {
  return revisar(await supabase.rpc('pnl_importar_recetas', { p_filas: filas }))
}

export async function listarProyectos(): Promise<Proyecto[]> {
  // Solo obras: el CRM y los pseudo-proyectos 'sistema' (anclas de accesos) no son destino de paneles
  return revisar(await supabase.from('proyectos').select('id, nombre').not('tipo', 'in', '(crm,sistema)').order('nombre')) ?? []
}

export async function listarProyectosPropios(): Promise<ProyectoPropio[]> {
  return revisar(await supabase.from('pnl_proyectos').select('id, nombre, activo').order('nombre')) ?? []
}

export async function guardarProyectoPropio(p: Omit<ProyectoPropio, 'id'> & { id?: string }) {
  const fila = { nombre: p.nombre.trim(), activo: p.activo }
  if (p.id) revisar(await supabase.from('pnl_proyectos').update(fila).eq('id', p.id))
  else revisar(await supabase.from('pnl_proyectos').insert(fila))
}

export async function eliminarProyectoPropio(id: string) {
  revisar(await supabase.from('pnl_proyectos').delete().eq('id', id))
}

// ---------------------------------------------------------------- producción

export async function listarPartes(desde: string, hasta: string, sucursal: FiltroSucursal): Promise<ParteV[]> {
  const filas = await todas<ParteV>((a, b) =>
    enSucursal(supabase.from('pnl_partes_v').select('*').gte('fecha', desde).lte('fecha', hasta), sucursal)
      .order('fecha', { ascending: false }).order('hora_desde', { ascending: false, nullsFirst: false }).order('numero', { ascending: false })
      .range(a, b),
  )
  return filas.map((f) => num(f, ['m2_buenos']))
}

export async function obtenerParte(id: string): Promise<{ parte: ParteV; lineas: LineaV[] }> {
  const [parte, lineas] = await Promise.all([
    supabase.from('pnl_partes_v').select('*').eq('id', id).maybeSingle(),
    supabase.from('pnl_lineas_v').select('*').eq('parte_id', id).order('panel_codigo'),
  ])
  const p = revisar(parte)
  if (!p) throw new Error('El registro no existe o no tiene acceso')
  return { parte: num(p, ['m2_buenos']), lineas: (revisar(lineas) ?? []).map((l) => num(l, ['m2_panel'])) }
}

export async function guardarParte(datos: {
  id?: string
  fecha: string
  hora_desde: string | null
  hora_hasta: string | null
  observacion: string
  sucursal: Sucursal
  lineas: LineaInput[]
}): Promise<string> {
  return revisar(
    await supabase.rpc('pnl_guardar_parte', {
      p_sucursal: datos.sucursal,
      p_parte_id: datos.id ?? null,
      p_fecha: datos.fecha,
      p_hora_desde: datos.hora_desde,
      p_hora_hasta: datos.hora_hasta,
      p_observacion: datos.observacion,
      p_lineas: datos.lineas,
    }),
  )
}

export async function eliminarParte(id: string) {
  revisar(await supabase.from('pnl_partes').delete().eq('id', id))
}

export async function listarLineas(desde: string, hasta: string, sucursal: FiltroSucursal): Promise<LineaV[]> {
  const filas = await todas<LineaV>((a, b) =>
    enSucursal(supabase.from('pnl_lineas_v').select('*').gte('fecha', desde).lte('fecha', hasta), sucursal).order('fecha').order('id').range(a, b),
  )
  return filas.map((f) => num(f, ['m2_panel']))
}

export async function listarConsumos(desde: string, hasta: string, sucursal: FiltroSucursal): Promise<ConsumoV[]> {
  const filas = await todas<ConsumoV>((a, b) =>
    enSucursal(supabase.from('pnl_consumos_v').select('*').gte('fecha', desde).lte('fecha', hasta), sucursal).order('fecha').order('linea_id').order('material_id').range(a, b),
  )
  return filas.map((f) => num(f, ['cantidad_unitaria', 'cantidad_buenos', 'cantidad_merma', 'cantidad_total']))
}

export async function listarConsumosParte(parteId: string): Promise<ConsumoV[]> {
  const filas = revisar(await supabase.from('pnl_consumos_v').select('*').eq('parte_id', parteId).order('material_codigo')) ?? []
  return filas.map((f) => num(f, ['cantidad_unitaria', 'cantidad_buenos', 'cantidad_merma', 'cantidad_total']))
}

// ---------------------------------------------------------------- cortes y stock (migración 20261013120000)

/** Panel de la estructura de un proyecto de SAP con su corte: lo planificado y lo cortado. */
export interface ItemSap {
  id: string
  proyecto_codigo: string
  proyecto_nombre: string
  cliente: string | null
  of_numero: number | null
  proyecto_activo: boolean
  sap_linea: number
  modelo_vivienda: string
  viviendas: number
  estructura: string
  tipo_panel: string
  panel_id: string
  panel_codigo: string
  panel_descripcion: string
  m2_panel: number
  paneles_por_vivienda: number
  paneles_plan: number
  corte_codigo: string
  corte_descripcion: string
  precio_m2: number | null
  corte_m2_plan: number | null
  cortados: number
  rechazados: number
  /** false: ya no está en la estructura de SAP (se conserva porque tiene cortes) */
  vigente: boolean
}

export interface ProyectoSap {
  codigo: string
  nombre: string
  cliente: string | null
  of_numero: number | null
  of_estado: string | null
  creado: string | null
  activo: boolean
  sincronizado_at: string
}

export interface ParteCorteV {
  id: string
  numero: number
  fecha: string
  hora_desde: string | null
  hora_hasta: string | null
  observacion: string | null
  created_by: string
  registrado_por: string | null
  created_at: string
  updated_by: string | null
  corregido_por: string | null
  updated_at: string
  lineas: number
  cortados: number
  rechazados: number
  m2_cortados: number
  sucursal: Sucursal
}

export interface LineaCorteV {
  id: string
  parte_id: string
  parte_numero: number
  fecha: string
  hora_desde: string | null
  hora_hasta: string | null
  item_id: string
  proyecto_codigo: string
  proyecto_nombre: string
  modelo_vivienda: string
  tipo_panel: string
  panel_id: string
  panel_codigo: string
  panel_descripcion: string
  m2_panel: number
  corte_codigo: string
  corte_descripcion: string
  precio_m2: number | null
  cortados: number
  rechazados: number
  total: number
  referencia: string | null
  sucursal: Sucursal
}

export interface LineaCorteInput {
  id?: string
  item_id: string
  cortados: number
  rechazados: number
  referencia: string
}

export interface StockPanel {
  panel_id: string
  panel_codigo: string
  panel_descripcion: string
  activo: boolean
  inicial: number
  inicial_actualizado: string | null
  fabricados: number
  cortados: number
  rechazados_corte: number
  disponible: number
}

const NUM_ITEM: (keyof ItemSap)[] = ['viviendas', 'm2_panel', 'paneles_por_vivienda', 'paneles_plan', 'precio_m2', 'corte_m2_plan']
const numItem = (i: ItemSap): ItemSap => {
  const c = num(i, NUM_ITEM)
  if (i.precio_m2 == null) c.precio_m2 = null
  if (i.corte_m2_plan == null) c.corte_m2_plan = null
  return c
}
const numLineaCorte = (l: LineaCorteV): LineaCorteV => ({ ...num(l, ['m2_panel']), precio_m2: l.precio_m2 == null ? null : Number(l.precio_m2) })

export async function listarProyectosSap(): Promise<ProyectoSap[]> {
  return todas((a, b) => supabase.from('pnl_sap_proyectos').select('*').order('codigo', { ascending: false }).range(a, b))
}

export async function listarItemsSap(proyectoCodigo?: string): Promise<ItemSap[]> {
  const filas = await todas<ItemSap>((a, b) => {
    let q = supabase.from('pnl_sap_items_v').select('*')
    if (proyectoCodigo) q = q.eq('proyecto_codigo', proyectoCodigo)
    return q.order('proyecto_codigo', { ascending: false }).order('sap_linea').range(a, b)
  })
  return filas.map(numItem)
}

export async function listarPartesCorte(desde: string, hasta: string, sucursal: FiltroSucursal): Promise<ParteCorteV[]> {
  const filas = await todas<ParteCorteV>((a, b) =>
    enSucursal(supabase.from('pnl_partes_corte_v').select('*').gte('fecha', desde).lte('fecha', hasta), sucursal)
      .order('fecha', { ascending: false }).order('hora_desde', { ascending: false, nullsFirst: false }).order('numero', { ascending: false })
      .range(a, b),
  )
  return filas.map((f) => num(f, ['m2_cortados']))
}

/** Por período (en una sucursal o las dos), o todo lo cortado de un proyecto en las sucursales que ve el usuario. */
export async function listarLineasCorte(filtro: { desde: string; hasta: string; sucursal: FiltroSucursal } | { proyecto: string }): Promise<LineaCorteV[]> {
  const filas = await todas<LineaCorteV>((a, b) => {
    let q = supabase.from('pnl_lineas_corte_v').select('*')
    q = 'proyecto' in filtro ? q.eq('proyecto_codigo', filtro.proyecto) : enSucursal(q.gte('fecha', filtro.desde).lte('fecha', filtro.hasta), filtro.sucursal)
    return q.order('fecha').order('id').range(a, b)
  })
  return filas.map(numLineaCorte)
}

export async function obtenerParteCorte(id: string): Promise<{ parte: ParteCorteV; lineas: LineaCorteV[] }> {
  const [parte, lineas] = await Promise.all([
    supabase.from('pnl_partes_corte_v').select('*').eq('id', id).maybeSingle(),
    supabase.from('pnl_lineas_corte_v').select('*').eq('parte_id', id).order('proyecto_codigo').order('panel_codigo'),
  ])
  const p = revisar(parte)
  if (!p) throw new Error('El registro no existe o no tienes acceso')
  return { parte: num(p, ['m2_cortados']), lineas: (revisar(lineas) ?? []).map(numLineaCorte) }
}

export async function guardarParteCorte(datos: {
  id?: string
  fecha: string
  hora_desde: string | null
  hora_hasta: string | null
  observacion: string
  sucursal: Sucursal
  lineas: LineaCorteInput[]
}): Promise<string> {
  return revisar(
    await supabase.rpc('pnl_guardar_parte_corte', {
      p_sucursal: datos.sucursal,
      p_parte_id: datos.id ?? null,
      p_fecha: datos.fecha,
      p_hora_desde: datos.hora_desde,
      p_hora_hasta: datos.hora_hasta,
      p_observacion: datos.observacion,
      p_lineas: datos.lineas,
    }),
  )
}

export async function eliminarParteCorte(id: string) {
  revisar(await supabase.from('pnl_partes_corte').delete().eq('id', id))
}

/** Stock por panel en una sucursal; con 'todas', sumado en las que ve el usuario. */
export async function listarStock(sucursal: FiltroSucursal): Promise<StockPanel[]> {
  return revisar(await supabase.rpc('pnl_stock_paneles', { p_sucursal: sucursal === 'todas' ? null : sucursal })) ?? []
}

/** Fija el stock inicial de un panel en una sucursal (0 lo deja en cero). La base rechaza si lo ya cortado allí queda sin respaldo. */
export async function guardarStockInicial(panelId: string, sucursal: Sucursal, cantidad: number) {
  revisar(await supabase.from('pnl_stock_inicial').upsert({ panel_id: panelId, sucursal, cantidad }, { onConflict: 'panel_id,sucursal' }))
}
