import { supabase } from '@/lib/supabaseClient'

// Acceso a datos del portal (migración 20261006120000_produccion_sip.sql). La RLS decide qué puede
// leer y escribir cada uno; aquí solo se arman las consultas y se traducen los errores.

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
  /** nombre de la obra del hub o del proyecto propio */
  proyecto_nombre: string | null
  referencia: string | null
}

export interface ConsumoV {
  linea_id: string
  parte_id: string
  fecha: string
  panel_id: string
  panel_codigo: string
  proyecto_id: string | null
  pnl_proyecto_id: string | null
  referencia: string | null
  material_id: string
  material_codigo: string
  material_descripcion: string
  unidad: string
  cantidad_unitaria: number
  cantidad_buenos: number
  cantidad_merma: number
  cantidad_total: number
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

export async function listarPartes(desde: string, hasta: string): Promise<ParteV[]> {
  const filas = await todas<ParteV>((a, b) =>
    supabase.from('pnl_partes_v').select('*').gte('fecha', desde).lte('fecha', hasta)
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
  lineas: LineaInput[]
}): Promise<string> {
  return revisar(
    await supabase.rpc('pnl_guardar_parte', {
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

export async function listarLineas(desde: string, hasta: string): Promise<LineaV[]> {
  const filas = await todas<LineaV>((a, b) =>
    supabase.from('pnl_lineas_v').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha').order('id').range(a, b),
  )
  return filas.map((f) => num(f, ['m2_panel']))
}

export async function listarConsumos(desde: string, hasta: string): Promise<ConsumoV[]> {
  const filas = await todas<ConsumoV>((a, b) =>
    supabase.from('pnl_consumos_v').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha').order('linea_id').order('material_id').range(a, b),
  )
  return filas.map((f) => num(f, ['cantidad_unitaria', 'cantidad_buenos', 'cantidad_merma', 'cantidad_total']))
}

export async function listarConsumosParte(parteId: string): Promise<ConsumoV[]> {
  const filas = revisar(await supabase.from('pnl_consumos_v').select('*').eq('parte_id', parteId).order('material_codigo')) ?? []
  return filas.map((f) => num(f, ['cantidad_unitaria', 'cantidad_buenos', 'cantidad_merma', 'cantidad_total']))
}
