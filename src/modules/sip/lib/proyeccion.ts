import { supabase } from '@/lib/supabaseClient'
import type { Sucursal } from '@/lib/lineasNegocio'
import { mensajeError, type FiltroSucursal } from './api'
import { hoyChile, sumarDias } from './formato'

// Proyección mensual por línea de negocio (migración 20261025120000_produccion_proyeccion.sql): lo
// proyectado del mes en pesos contra lo producido de verdad, semana a semana, valorizado al precio de
// las órdenes de venta de SAP, y lo facturado en SAP. Las semanas van de lunes a domingo, cortadas en
// el límite del mes (como las columnas SEM de la planilla de programa de producción).

export interface LineaProy {
  codigo: string
  nombre: string
  orden: number
}

export interface MedidaProy {
  articulo: string
  descripcion: string
  unidad: string
  prioridad: number
}

export interface OvProy {
  doc_entry: number
  linea: number
  doc_num: number
  fecha: string | null
  estado: string | null
  proyecto_codigo: string
  proyecto_nombre: string | null
  cliente: string | null
  ceco: string
  linea_codigo: string
  sucursal: Sucursal | null
  articulo: string | null
  descripcion: string
  tipo_vivienda: string
  tipo_estructura: string
  unidad: string | null
  cantidad: number
  entregada: number
  pendiente: number
  precio: number
  total: number
  medida: number | null
  medida_unidad: string | null
  medida_origen: 'estructura' | 'kit' | null
  medida_manual: number | null
  unidad_manual: string | null
  medida_efectiva: number | null
  unidad_efectiva: string
  sincronizado_at: string
}

export interface AvanceProy {
  id: string
  sucursal: Sucursal
  mes: string
  semana: string
  doc_entry: number
  linea: number
  doc_num: number
  proyecto_codigo: string
  proyecto_nombre: string | null
  cliente: string | null
  descripcion: string
  linea_codigo: string
  precio: number
  medida: number | null
  unidad: string | null
  cantidad: number
  avance_pct: number | null
  valor: number
  medida_total: number
  created_by: string | null
  updated_at: string
  actualizado_por: string | null
}

export interface ManualProy {
  id: string
  sucursal: Sucursal
  mes: string
  semana: string
  linea_codigo: string
  glosa: string
  cantidad: number | null
  unidad: string | null
  monto: number
  created_by: string | null
  updated_at: string
  actualizado_por: string | null
}

export interface MesProy {
  sucursal: Sucursal
  mes: string
  linea_codigo: string
  monto: number
  nota: string | null
}

export interface DiasProy {
  sucursal: Sucursal
  mes: string
  semana: string
  dias: number
}

export interface FacturadoProy {
  linea_codigo: string
  sucursal: Sucursal
  monto: number
}

export interface AvanceInput {
  doc_entry: number
  linea: number
  cantidad: number
  avance_pct?: number | null
  /** medida por unidad escrita a mano (con su unidad) */
  medida?: number | null
  unidad?: string | null
}

export interface ManualInput {
  linea_codigo: string
  glosa: string
  cantidad: number | null
  unidad: string | null
  monto: number
}

/** Tecno Home se registra por % de avance acumulado de cada línea de OV. */
export const LINEA_POR_AVANCE = '16'

// ---------------------------------------------------------------- acceso a datos

type ErrorDb = { message: string; code?: string } | null

function revisar<T>({ data, error }: { data: T | null; error: ErrorDb }): T {
  if (error) throw new Error(mensajeError(error))
  return data as T
}

async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: ErrorDb }>): Promise<T[]> {
  const salida: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const pagina = revisar(await consulta(desde, desde + 999)) ?? []
    salida.push(...pagina)
    if (pagina.length < 1000) return salida
  }
}

const n = (v: unknown) => (v == null ? null : Number(v))
const n0 = (v: unknown) => Number(v ?? 0)

function enSucursal<Q extends { eq: (columna: string, valor: string) => Q }>(q: Q, sucursal: FiltroSucursal): Q {
  return sucursal === 'todas' ? q : q.eq('sucursal', sucursal)
}

export async function listarLineasProy(): Promise<LineaProy[]> {
  return revisar(await supabase.from('pnl_proy_lineas').select('*').order('orden')) ?? []
}

export async function listarMedidas(): Promise<MedidaProy[]> {
  return revisar(await supabase.from('pnl_proy_medidas').select('articulo, descripcion, unidad, prioridad').order('prioridad').order('articulo')) ?? []
}

export async function guardarMedida(m: MedidaProy) {
  revisar(await supabase.from('pnl_proy_medidas').upsert({ ...m, updated_at: new Date().toISOString() }, { onConflict: 'articulo' }))
}

export async function eliminarMedida(articulo: string) {
  revisar(await supabase.from('pnl_proy_medidas').delete().eq('articulo', articulo))
}

/** Líneas de OV de una sucursal (y las que SAP no trae con sucursal). */
export async function listarOvProy(sucursal: Sucursal): Promise<OvProy[]> {
  const filas = await todas<OvProy>((a, b) =>
    supabase
      .from('pnl_proy_ov_v')
      .select('*')
      .or(`sucursal.eq.${sucursal},sucursal.is.null`)
      .order('linea_codigo')
      .order('proyecto_codigo')
      .order('doc_num')
      .order('linea')
      .range(a, b),
  )
  return filas.map((f) => ({
    ...f,
    cantidad: n0(f.cantidad),
    entregada: n0(f.entregada),
    pendiente: n0(f.pendiente),
    precio: n0(f.precio),
    total: n0(f.total),
    medida: n(f.medida),
    medida_manual: n(f.medida_manual),
    medida_efectiva: n(f.medida_efectiva),
  }))
}

const numAvance = (f: AvanceProy): AvanceProy => ({
  ...f,
  precio: n0(f.precio),
  medida: n(f.medida),
  cantidad: n0(f.cantidad),
  avance_pct: n(f.avance_pct),
  valor: n0(f.valor),
  medida_total: n0(f.medida_total),
})

/** Lo producido de un mes. */
export async function listarAvance(mes: string, sucursal: FiltroSucursal): Promise<AvanceProy[]> {
  const filas = await todas<AvanceProy>((a, b) =>
    enSucursal(supabase.from('pnl_proy_avance_v').select('*').eq('mes', mes), sucursal).order('semana').order('doc_num').order('linea').range(a, b),
  )
  return filas.map(numAvance)
}

/** Todo lo registrado de una sucursal (para el saldo de cada línea de OV y el avance acumulado). */
export async function listarAvanceTotal(sucursal: Sucursal): Promise<AvanceProy[]> {
  const filas = await todas<AvanceProy>((a, b) =>
    supabase
      .from('pnl_proy_avance')
      .select('id, sucursal, mes, semana, doc_entry, linea, cantidad, avance_pct, created_by')
      .eq('sucursal', sucursal)
      .order('mes')
      .order('semana')
      .range(a, b) as unknown as PromiseLike<{ data: AvanceProy[] | null; error: ErrorDb }>,
  )
  return filas.map((f) => ({ ...f, cantidad: n0(f.cantidad), avance_pct: n(f.avance_pct) }))
}

export async function listarManual(mes: string, sucursal: FiltroSucursal): Promise<ManualProy[]> {
  const filas = await todas<ManualProy>((a, b) =>
    enSucursal(supabase.from('pnl_proy_manual_v').select('*').eq('mes', mes), sucursal).order('semana').order('created_at').range(a, b),
  )
  return filas.map((f) => ({ ...f, cantidad: n(f.cantidad), monto: n0(f.monto) }))
}

export async function listarMes(mes: string, sucursal: FiltroSucursal): Promise<MesProy[]> {
  const filas = revisar<MesProy[]>(await enSucursal(supabase.from('pnl_proy_mes').select('*').eq('mes', mes), sucursal)) ?? []
  return filas.map((f) => ({ ...f, monto: n0(f.monto) }))
}

export async function listarDias(mes: string, sucursal: FiltroSucursal): Promise<DiasProy[]> {
  const filas = revisar<DiasProy[]>(await enSucursal(supabase.from('pnl_proy_dias').select('*').eq('mes', mes), sucursal)) ?? []
  return filas.map((f) => ({ ...f, dias: n0(f.dias) }))
}

/** Lo facturado en SAP en el mes. En Supabase (sin sap_ventas) viene vacío. */
export async function listarFacturado(mes: string): Promise<FacturadoProy[]> {
  const filas = (revisar(await supabase.rpc('pnl_proy_facturado', { p_mes: mes })) as FacturadoProy[] | null) ?? []
  return filas.map((f) => ({ ...f, monto: n0(f.monto) }))
}

/** Guarda la proyección del mes de una sucursal: las líneas sin monto se borran. */
export async function guardarMes(sucursal: Sucursal, mes: string, filas: { linea_codigo: string; monto: number | null; nota: string | null }[]) {
  const conMonto = filas.filter((f) => f.monto != null)
  const sinMonto = filas.filter((f) => f.monto == null).map((f) => f.linea_codigo)
  if (conMonto.length)
    revisar(
      await supabase.from('pnl_proy_mes').upsert(
        conMonto.map((f) => ({ sucursal, mes, linea_codigo: f.linea_codigo, monto: f.monto, nota: f.nota, updated_at: new Date().toISOString() })),
        { onConflict: 'sucursal,mes,linea_codigo' },
      ),
    )
  if (sinMonto.length) revisar(await supabase.from('pnl_proy_mes').delete().eq('sucursal', sucursal).eq('mes', mes).in('linea_codigo', sinMonto))
}

/** Días hábiles de las semanas del mes: null = lo de por defecto (se borra la fila). */
export async function guardarDias(sucursal: Sucursal, mes: string, filas: { semana: string; dias: number | null }[]) {
  const conDias = filas.filter((f) => f.dias != null)
  const sinDias = filas.filter((f) => f.dias == null).map((f) => f.semana)
  if (conDias.length)
    revisar(
      await supabase
        .from('pnl_proy_dias')
        .upsert(conDias.map((f) => ({ sucursal, mes, semana: f.semana, dias: f.dias, updated_at: new Date().toISOString() })), { onConflict: 'sucursal,mes,semana' }),
    )
  if (sinDias.length) revisar(await supabase.from('pnl_proy_dias').delete().eq('sucursal', sucursal).eq('mes', mes).in('semana', sinDias))
}

export async function guardarSemana(sucursal: Sucursal, mes: string, semana: string, avance: AvanceInput[], manual: ManualInput[]) {
  return revisar(
    await supabase.rpc('pnl_proy_guardar_semana', { p_sucursal: sucursal, p_mes: mes, p_semana: semana, p_avance: avance, p_manual: manual }),
  ) as { avance: number; manual: number }
}

// ---------------------------------------------------------------- calendario

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export const mesActual = () => `${hoyChile().slice(0, 7)}-01`
export const fmtMes = (mes: string) => `${MESES[+mes.slice(5, 7) - 1]} ${mes.slice(0, 4)}`
export const finDeMes = (mes: string) => sumarDias(sumarMeses(mes, 1), -1)

export function sumarMeses(mes: string, k: number): string {
  const a = +mes.slice(0, 4)
  const m = +mes.slice(5, 7) - 1 + k
  const d = new Date(Date.UTC(a, m, 1))
  return d.toISOString().slice(0, 10)
}

/** Domingo de Pascua (algoritmo de Butcher). */
function pascua(anio: number): string {
  const a = anio % 19
  const b = Math.floor(anio / 100)
  const c = anio % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** Feriados de Chile que no se mueven (más el Viernes Santo). Los que se trasladan a lunes, los
 *  de pueblos indígenas o las elecciones se corrigen a mano en los días hábiles de la semana. */
export function feriadosFijos(anio: number): Set<string> {
  const fijos = ['01-01', '05-01', '05-21', '07-16', '08-15', '09-18', '09-19', '11-01', '12-08', '12-25'].map((md) => `${anio}-${md}`)
  return new Set([...fijos, sumarDias(pascua(anio), -2)])
}

const diaSemana = (f: string) => new Date(Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10))).getUTCDay()

/** Lunes a viernes entre dos fechas (incluidas), sin feriados fijos. */
export function diasHabiles(desde: string, hasta: string): number {
  const feriados = new Map<number, Set<string>>()
  let total = 0
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const dow = diaSemana(f)
    if (dow === 0 || dow === 6) continue
    const anio = +f.slice(0, 4)
    if (!feriados.has(anio)) feriados.set(anio, feriadosFijos(anio))
    if (!feriados.get(anio)!.has(f)) total++
  }
  return total
}

/** Semana ISO del año (la de la planilla: SEM 27, SEM 28...). */
export function semanaIso(fecha: string): number {
  const d = new Date(Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10)))
  const dow = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dow)
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - inicioAnio.getTime()) / 86_400_000 + 1) / 7)
}

export interface SemanaMes {
  /** lunes de la semana (la clave) */
  semana: string
  numero: number
  /** parte de la semana dentro del mes */
  desde: string
  hasta: string
  diasDefecto: number
}

export function semanasDelMes(mes: string): SemanaMes[] {
  const fin = finDeMes(mes)
  const dow = diaSemana(mes)
  let lunes = sumarDias(mes, -((dow + 6) % 7))
  const salida: SemanaMes[] = []
  while (lunes <= fin) {
    const desde = lunes < mes ? mes : lunes
    const domingo = sumarDias(lunes, 6)
    const hasta = domingo > fin ? fin : domingo
    salida.push({ semana: lunes, numero: semanaIso(lunes), desde, hasta, diasDefecto: diasHabiles(desde, hasta) })
    lunes = sumarDias(lunes, 7)
  }
  return salida
}

/** La semana del mes que contiene la fecha (o la primera/última si la fecha cae fuera). */
export function semanaDeFecha(semanas: SemanaMes[], fecha: string): string {
  const s = semanas.find((x) => x.desde <= fecha && fecha <= x.hasta)
  if (s) return s.semana
  return fecha < semanas[0].desde ? semanas[0].semana : semanas[semanas.length - 1].semana
}

export const fmtRango = (s: SemanaMes) => `${s.desde.slice(8, 10)}-${s.desde.slice(5, 7)} al ${s.hasta.slice(8, 10)}-${s.hasta.slice(5, 7)}`

// ---------------------------------------------------------------- resumen

export interface FilaUnidades {
  linea_codigo: string
  unidad: string
  porSemana: Map<string, number>
  total: number
}

export interface FilaValor {
  linea_codigo: string
  proyectado: number
  porSemana: Map<string, number>
  total: number
  facturado: number
}

export interface Resumen {
  semanas: (SemanaMes & { dias: number })[]
  diasMes: number
  /** días hábiles ya transcurridos del mes (hasta hoy), para la producción por día */
  diasTranscurridos: number
  unidades: FilaUnidades[]
  valor: FilaValor[]
  total: FilaValor
}

const sumar = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)

export function armarResumen({
  mes,
  lineas,
  avance,
  manual,
  proyectado,
  dias,
  facturado,
  hoy = hoyChile(),
}: {
  mes: string
  lineas: LineaProy[]
  avance: AvanceProy[]
  manual: ManualProy[]
  proyectado: MesProy[]
  dias: DiasProy[]
  facturado: FacturadoProy[]
  hoy?: string
}): Resumen {
  // con las dos sucursales a la vista, los días de una semana son los de la que tenga más
  const diasDe = new Map<string, number>()
  for (const d of dias) diasDe.set(d.semana, Math.max(diasDe.get(d.semana) ?? 0, d.dias))
  const semanas = semanasDelMes(mes).map((s) => ({ ...s, dias: diasDe.get(s.semana) ?? s.diasDefecto }))
  const diasMes = semanas.reduce((a, s) => a + s.dias, 0)
  let diasTranscurridos = 0
  for (const s of semanas) {
    if (s.hasta <= hoy) diasTranscurridos += s.dias
    else if (s.desde <= hoy) diasTranscurridos += Math.min(s.dias, diasHabiles(s.desde, hoy))
  }

  const unidades = new Map<string, FilaUnidades>()
  const unidadDe = (linea: string, unidad: string) => {
    const k = `${linea}|${unidad}`
    let f = unidades.get(k)
    if (!f) unidades.set(k, (f = { linea_codigo: linea, unidad, porSemana: new Map(), total: 0 }))
    return f
  }
  const valor = new Map<string, FilaValor>(lineas.map((l) => [l.codigo, { linea_codigo: l.codigo, proyectado: 0, porSemana: new Map(), total: 0, facturado: 0 }]))
  const valorDe = (linea: string) => valor.get(linea)

  for (const a of avance) {
    const v = valorDe(a.linea_codigo)
    if (v) {
      sumar(v.porSemana, a.semana, a.valor)
      v.total += a.valor
    }
    if (a.medida_total > 0) {
      const u = unidadDe(a.linea_codigo, a.unidad ?? 'un')
      sumar(u.porSemana, a.semana, a.medida_total)
      u.total += a.medida_total
    }
  }
  for (const m of manual) {
    const v = valorDe(m.linea_codigo)
    if (v) {
      sumar(v.porSemana, m.semana, m.monto)
      v.total += m.monto
    }
    if (m.cantidad && m.unidad) {
      const u = unidadDe(m.linea_codigo, m.unidad)
      sumar(u.porSemana, m.semana, m.cantidad)
      u.total += m.cantidad
    }
  }
  for (const p of proyectado) {
    const v = valorDe(p.linea_codigo)
    if (v) v.proyectado += p.monto
  }
  for (const f of facturado) {
    const v = valorDe(f.linea_codigo)
    if (v) v.facturado += f.monto
  }

  const orden = new Map(lineas.map((l, i) => [l.codigo, i]))
  const total: FilaValor = { linea_codigo: '', proyectado: 0, porSemana: new Map(), total: 0, facturado: 0 }
  for (const v of valor.values()) {
    total.proyectado += v.proyectado
    total.total += v.total
    total.facturado += v.facturado
    for (const [k, x] of v.porSemana) sumar(total.porSemana, k, x)
  }
  return {
    semanas,
    diasMes,
    diasTranscurridos,
    unidades: [...unidades.values()].sort((a, b) => (orden.get(a.linea_codigo) ?? 99) - (orden.get(b.linea_codigo) ?? 99) || a.unidad.localeCompare(b.unidad)),
    valor: [...valor.values()],
    total,
  }
}

/** Proyección al cierre: lo producido por día hábil transcurrido × días hábiles del mes. */
export const proyeccionCierre = (total: number, r: Pick<Resumen, 'diasMes' | 'diasTranscurridos'>) =>
  r.diasTranscurridos > 0 ? (total / r.diasTranscurridos) * r.diasMes : null
