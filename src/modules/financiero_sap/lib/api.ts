import { supabase } from '@/lib/supabaseClient'

// Lecturas y escrituras del portal Financiero. Las tablas fin_* existen solo en el servidor propio
// (las llena la sincronización con SAP); en Supabase PostgREST responde "no existe" y el portal lo
// avisa en vez de fallar. La seguridad (informe y sucursal) la aplica la base: aquí no se filtra por
// permisos, solo se pide.

export interface Cuenta {
  codigo: string
  codigo_formato: string | null
  nombre: string
  grupo: number
  nivel: number
  padre: string | null
  imputable: boolean
}

export interface Ceco {
  codigo: string
  nombre: string
  linea: string | null
  sucursal: string | null
  tipo: 'linea' | 'administracion' | null
  activo: boolean
}

export interface Dim2 {
  codigo: string
  nombre: string
}

export interface Catalogos {
  cuentas: Cuenta[]
  cecos: Ceco[]
  dim2: Dim2[]
}

/** Resultado de fin_eerr: haber - debe (ingresos positivos, costos y gastos negativos). */
export interface FilaEerr {
  periodo: string // 'YYYY-MM-01'
  cuenta: string
  ceco: string
  dim2: string
  proyecto: string
  monto: number
  /** true = parte de la administración repartida a este CECO de línea (no tiene asientos propios). */
  prorrateado: boolean
}

export interface Asiento {
  trans_id: number
  linea_id: number
  fecha: string
  numero: number | null
  tipo_trans: string
  referencia: string | null
  glosa: string | null
  cuenta: string
  ceco: string
  dim2: string
  proyecto: string
  debe: number
  haber: number
}

export interface Prorrateo {
  anio: number
  ceco: string
  porcentaje: number
  actualizado_por: string | null
  actualizado_en: string
}

export interface EstadoSync {
  sincronizado_en: string
  completo_en: string | null
  asientos: number
  primer_periodo: string | null
  ultimo_periodo: string | null
}

export interface MisAccesos {
  admin: boolean
  configurar: boolean
  eerr: string[]
  balance: string[]
  ventas: string[]
}

/** El portal no está instalado en esta base (Supabase): PostgREST no conoce la tabla o la función. */
export class SinPortalError extends Error {
  constructor() {
    super('El portal Financiero está disponible solo en el portal interno (servidor propio).')
  }
}

function lanzar(error: { code?: string; message: string }): never {
  if (error.code === 'PGRST205' || error.code === 'PGRST202' || error.code === '42P01' || error.code === '42883') throw new SinPortalError()
  throw new Error(error.message)
}

const PAGINA = 1000

// PostgREST corta en max-rows (Supabase: 1000): se pide por páginas hasta que una vuelva incompleta.
async function paginado<T>(pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>) {
  const filas: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pedir(desde, desde + PAGINA - 1)
    if (error) lanzar(error)
    filas.push(...(data ?? []))
    if (!data || data.length < PAGINA) return filas
  }
}

export async function misAccesos(): Promise<MisAccesos> {
  const { data, error } = await supabase.rpc('fin_mis_accesos')
  if (error) lanzar(error)
  return data as MisAccesos
}

let catalogos: Promise<Catalogos> | null = null

/** Plan de cuentas, CECO y dimensión 2: cambian poco, se piden una vez por sesión. */
export function cargarCatalogos(): Promise<Catalogos> {
  if (!catalogos) {
    catalogos = (async () => {
      const [cuentas, cecos, dim2] = await Promise.all([
        paginado<Cuenta>((d, h) => supabase.from('fin_cuentas').select('*').order('codigo').range(d, h)),
        paginado<Ceco>((d, h) => supabase.from('fin_cecos').select('*').order('codigo').range(d, h)),
        paginado<Dim2>((d, h) => supabase.from('fin_dim2').select('*').order('codigo').range(d, h)),
      ])
      return { cuentas, cecos, dim2 }
    })()
    catalogos.catch(() => (catalogos = null))
  }
  return catalogos
}

/** Estado de resultados entre dos meses (inclusive). desde/hasta: 'YYYY-MM'. */
export async function cargarEerr(desde: string, hasta: string, prorratear: boolean): Promise<FilaEerr[]> {
  const filas = await paginado<FilaEerr>((d, h) =>
    supabase
      .rpc('fin_eerr', { p_desde: `${desde}-01`, p_hasta: `${hasta}-01`, p_prorratear: prorratear })
      .order('periodo')
      .order('cuenta')
      .order('ceco')
      .order('dim2')
      .order('proyecto')
      .order('prorrateado')
      .range(d, h),
  )
  return filas.map((f) => ({ ...f, monto: Number(f.monto) }))
}

export interface FiltroAsientos {
  desde: string // 'YYYY-MM'
  hasta: string
  cuentas: string[]
  /** null = todos los CECO que la base deje ver */
  cecos: string[] | null
  dim2: string | null
}

export const MAX_ASIENTOS = 2000

/** Asientos que forman una cifra. Devuelve hasta MAX_ASIENTOS + 1 para saber si hay más. */
export async function cargarAsientos(f: FiltroAsientos): Promise<Asiento[]> {
  let q = supabase
    .from('fin_asientos')
    .select('trans_id, linea_id, fecha, numero, tipo_trans, referencia, glosa, cuenta, ceco, dim2, proyecto, debe, haber')
    .gte('periodo', `${f.desde}-01`)
    .lte('periodo', `${f.hasta}-01`)
    .in('cuenta', f.cuentas)
  if (f.cecos) q = q.in('ceco', f.cecos)
  if (f.dim2 !== null) q = q.eq('dim2', f.dim2)
  const { data, error } = await q.order('fecha').order('trans_id').order('linea_id').limit(MAX_ASIENTOS + 1)
  if (error) lanzar(error)
  return (data ?? []).map((a) => ({ ...a, debe: Number(a.debe), haber: Number(a.haber) })) as Asiento[]
}

export async function cargarProrrateo(): Promise<Prorrateo[]> {
  const filas = await paginado<Prorrateo>((d, h) => supabase.from('fin_prorrateo').select('*').order('anio').order('ceco').range(d, h))
  return filas.map((p) => ({ ...p, porcentaje: Number(p.porcentaje) }))
}

/** Reemplaza los % del año. Lista vacía: el año queda sin prorrateo. */
export async function guardarProrrateo(anio: number, filas: { ceco: string; porcentaje: number }[]) {
  const { error } = await supabase.rpc('fin_guardar_prorrateo', { p_anio: anio, p: filas })
  if (error) lanzar(error)
}

export async function cargarEstado(): Promise<EstadoSync | null> {
  const { data, error } = await supabase.from('fin_estado').select('*').maybeSingle()
  if (error) lanzar(error)
  return data as EstadoSync | null
}
