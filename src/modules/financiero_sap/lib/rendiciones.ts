import { supabase } from '@/lib/supabaseClient'
import { lanzar, paginado } from './api'

// Rendiciones de Rindegastos (fase 1: leer, proponer el asiento y aprobar; nada se escribe en SAP ni en
// Rindegastos). Las tablas rg_* existen solo en el servidor: las llena stack\tareas\sincronizar-rindegastos.ps1
// (migración 20261112120000_financiero_rindegastos.sql). Las correcciones y aprobaciones pasan por RPC que
// validan el permiso fin:rendiciones_aprobar.

export type EstadoRendicion = 'pendiente' | 'observado' | 'aprobado'

export const ESTADOS: { key: EstadoRendicion; label: string }[] = [
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'observado', label: 'Con observaciones' },
  { key: 'aprobado', label: 'Aprobadas' },
]

export interface Archivo {
  nombre: string | null
  original: string | null
  grande: string | null
}

export interface Informe {
  id: number
  folio: string | null
  titulo: string | null
  empleado_nombre: string | null
  empleado_email: string | null
  empleado_rut: string | null
  empleado_ceco: string | null
  politica: string | null
  fondo: string | null
  aprobador: string | null
  fecha_envio: string | null
  fecha_cierre: string | null
  total: number
  total_aprobado: number
  moneda: string
  nota: string | null
  campos: Record<string, string | null>
  archivos: Archivo[]
  estado: EstadoRendicion
  observacion: string | null
  fecha_asiento: string | null
  aprobado_en: string | null
  cambio_rg: boolean
  sincronizado_en: string
}

export interface Gasto {
  id: number
  informe_id: number
  estado_rg: number
  fecha: string | null
  proveedor: string | null
  categoria: string
  tipo_documento: string | null
  numero_documento: string | null
  neto: number
  iva: number
  total: number
  moneda: string
  nota: string | null
  campos: Record<string, string | null>
  archivos: Archivo[]
  incluir: boolean | null
  cuenta: string | null
  ceco: string | null
  proyecto: string | null
  glosa: string | null
}

export interface LineaAsiento {
  informe_id: number
  gasto_id: number | null
  lado: 'debe' | 'haber'
  cuenta: string | null
  ceco: string | null
  proyecto: string | null
  glosa: string | null
  debe: number
  haber: number
  motivo_exclusion: string | null
}

export interface Categoria {
  categoria: string
  categoria_codigo: string | null
  cuenta: string | null
  regla_ceco: 'campo' | 'empleado' | 'fijo' | 'manual'
  ceco_fijo: string | null
  excluir: boolean
}

export interface ConfigRendiciones {
  cuenta_contrapartida: string | null
  campo_ceco: string | null
  campo_proyecto: string | null
  campo_tipo_documento: string | null
  campo_numero_documento: string | null
  tipos_excluidos: string[]
  excluir_con_iva: boolean
  desde: string
}

export interface CuentaSap {
  codigo: string
  codigo_formato: string | null
  nombre: string
  activa: boolean
}

export interface ProyectoSap {
  codigo: string
  nombre: string
  activo: boolean
}

export interface Historial {
  id: number
  informe_id: number
  accion: string
  detalle: string | null
  usuario: string | null
  usuario_nombre: string | null
  en: string
}

export interface EstadoSyncRg {
  sincronizado_en: string
  informes: number
  gastos: number
  mensaje: string | null
}

export const REGLAS_CECO: { key: Categoria['regla_ceco']; label: string; detalle: string }[] = [
  { key: 'campo', label: 'Campo del gasto', detalle: 'El campo extra de CECO del gasto (o del informe)' },
  { key: 'empleado', label: 'CECO del colaborador', detalle: 'El centro de costo del colaborador en Rindegastos' },
  { key: 'fijo', label: 'CECO fijo', detalle: 'Siempre el mismo CECO' },
  { key: 'manual', label: 'Lo asigna contabilidad', detalle: 'Se elige al revisar cada gasto' },
]

const num = <T extends object>(o: T, campos: (keyof T)[]): T => {
  const r = { ...o }
  for (const c of campos) (r as Record<keyof T, unknown>)[c] = Number(o[c] ?? 0)
  return r
}

export async function cargarInformes(): Promise<Informe[]> {
  const filas = await paginado<Informe>((d, h) =>
    supabase
      .from('rg_informes')
      .select('id, folio, titulo, empleado_nombre, empleado_email, empleado_rut, empleado_ceco, politica, fondo, aprobador, fecha_envio, fecha_cierre, total, total_aprobado, moneda, nota, campos, archivos, estado, observacion, fecha_asiento, aprobado_en, cambio_rg, sincronizado_en')
      .order('fecha_cierre', { ascending: false })
      .order('id', { ascending: false })
      .range(d, h),
  )
  return filas.map((f) => num(f, ['total', 'total_aprobado']))
}

/** Asiento propuesto de todos los informes (para totales y problemas de la bandeja) o de uno. */
export async function cargarAsiento(informe?: number): Promise<LineaAsiento[]> {
  const filas = await paginado<LineaAsiento>((d, h) => {
    let q = supabase.from('rg_asiento_lineas').select('*')
    if (informe !== undefined) q = q.eq('informe_id', informe)
    return q.order('informe_id').order('lado').order('gasto_id').range(d, h)
  })
  return filas.map((f) => num(f, ['debe', 'haber']))
}

export async function cargarInforme(id: number) {
  const [inf, gastos, historial, problemas] = await Promise.all([
    supabase.from('rg_informes').select('*').eq('id', id).maybeSingle(),
    supabase.from('rg_gastos').select('*').eq('informe_id', id).order('fecha').order('id'),
    supabase.from('rg_historial').select('*').eq('informe_id', id).order('en', { ascending: false }),
    supabase.rpc('rg_problemas', { p_informe: id }),
  ])
  for (const r of [inf, gastos, historial, problemas]) if (r.error) lanzar(r.error)
  return {
    informe: inf.data ? num(inf.data as Informe, ['total', 'total_aprobado']) : null,
    gastos: ((gastos.data ?? []) as Gasto[]).map((g) => num(g, ['neto', 'iva', 'total'])),
    historial: (historial.data ?? []) as Historial[],
    problemas: (problemas.data ?? []) as string[],
  }
}

let catalogos: Promise<{ cuentas: CuentaSap[]; proyectos: ProyectoSap[] }> | null = null

/** Plan de cuentas imputable y proyectos de SAP: cambian poco, se piden una vez por sesión. */
export function cargarCatalogosSap() {
  if (!catalogos) {
    catalogos = (async () => {
      const [cuentas, proyectos] = await Promise.all([
        paginado<CuentaSap>((d, h) => supabase.from('rg_cuentas_sap').select('*').order('codigo_formato').range(d, h)),
        paginado<ProyectoSap>((d, h) => supabase.from('rg_proyectos_sap').select('*').order('codigo').range(d, h)),
      ])
      return { cuentas, proyectos }
    })()
    catalogos.catch(() => (catalogos = null))
  }
  return catalogos
}

export async function cargarPeriodos(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('rg_periodos_sap').select('periodo, estado')
  if (error) lanzar(error)
  return Object.fromEntries((data ?? []).map((p) => [String(p.periodo).slice(0, 7), p.estado as string]))
}

export async function cargarConfig(): Promise<{ config: ConfigRendiciones; categorias: Categoria[]; estado: EstadoSyncRg | null }> {
  const [cfg, cats, est] = await Promise.all([
    supabase.from('rg_config').select('*').maybeSingle(),
    supabase.from('rg_categorias').select('*').order('categoria'),
    supabase.from('rg_estado').select('*').maybeSingle(),
  ])
  for (const r of [cfg, cats, est]) if (r.error) lanzar(r.error)
  return { config: cfg.data as ConfigRendiciones, categorias: (cats.data ?? []) as Categoria[], estado: est.data as EstadoSyncRg | null }
}

/** Nombres de campos extra que aparecen en los gastos e informes (para elegir cuál es el CECO, etc.). */
export async function cargarNombresCampos(): Promise<string[]> {
  const [g, i] = await Promise.all([
    paginado<{ campos: Record<string, unknown> }>((d, h) => supabase.from('rg_gastos').select('campos').range(d, h)),
    paginado<{ campos: Record<string, unknown> }>((d, h) => supabase.from('rg_informes').select('campos').range(d, h)),
  ])
  const nombres = new Set<string>()
  for (const f of [...g, ...i]) for (const k of Object.keys(f.campos ?? {})) nombres.add(k)
  return [...nombres].sort((a, b) => a.localeCompare(b, 'es'))
}

export type CambioGasto = Partial<Pick<Gasto, 'incluir' | 'cuenta' | 'ceco' | 'proyecto' | 'glosa'>>

export async function guardarGasto(id: number, cambio: CambioGasto) {
  const { error } = await supabase.rpc('rg_guardar_gasto', { p_gasto: id, p: cambio })
  if (error) lanzar(error)
}

export async function cambiarEstado(id: number, estado: EstadoRendicion, opciones: { observacion?: string; fecha?: string } = {}) {
  const { error } = await supabase.rpc('rg_cambiar_estado', {
    p_informe: id,
    p_estado: estado,
    p_observacion: opciones.observacion ?? null,
    p_fecha: opciones.fecha ?? null,
  })
  if (error) lanzar(error)
}

export async function guardarCategorias(filas: Pick<Categoria, 'categoria' | 'cuenta' | 'regla_ceco' | 'ceco_fijo' | 'excluir'>[]) {
  const { error } = await supabase.rpc('rg_guardar_categorias', { p: filas })
  if (error) lanzar(error)
}

export async function guardarConfig(config: ConfigRendiciones) {
  const { error } = await supabase.rpc('rg_guardar_config', { p: config })
  if (error) lanzar(error)
}

/** "6101117 · Viático" a partir del AcctCode. */
export function nombreCuenta(cuentas: Map<string, CuentaSap>, codigo: string | null) {
  if (!codigo) return null
  const c = cuentas.get(codigo)
  return c ? `${c.codigo_formato ?? c.codigo} · ${c.nombre}` : codigo
}
