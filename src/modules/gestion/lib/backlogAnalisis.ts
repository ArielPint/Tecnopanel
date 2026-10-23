// Cálculos del análisis del backlog (Gestión › Backlog). Todo en el navegador sobre la historia de SAP:
//   backlog de un proyecto a la fecha D = notas de venta hasta D − guías hasta D + devoluciones hasta D
//   − facturas sin guía hasta D, solo si el proyecto tenía alguna nota de venta abierta en D y el saldo es > 0.
// Una nota de venta está abierta en D si su fecha ≤ D y (sigue abierta o su cierre es posterior a D). SAP no
// guarda la fecha de cierre: se usa la última modificación, así que la historia reconstruida es aproximada.
// Desde que existe la foto diaria (sap_backlog_foto), el backlog de esa fecha sale de la foto (oficial).

export type Granularidad = 'semana' | 'mes'

export interface ProyectoHist {
  codigo: string
  nombre: string
  cliente: string | null
  linea: string | null
  sucursal: string | null
}

export interface NotaVenta {
  proyecto: string
  fecha: string
  cierre: string | null
  monto: number
}

export interface Movimiento {
  proyecto: string
  fecha: string
  tipo: 'despacho' | 'devolucion' | 'factura_directa'
  monto: number
}

/** Foto de un proyecto a una fecha: contratado − despachado − facturado sin guía. */
export interface FotoProyecto {
  proyecto: string
  saldo: number
}

export interface Periodo {
  clave: string
  etiqueta: string
  inicio: string
  /** Último día del período, o hoy si el período está en curso. */
  fin: string
  enCurso: boolean
}

export interface PuntoSerie {
  periodo: Periodo
  backlog: number
  porLinea: Record<string, number>
  porSucursal: Record<string, number>
  fuente: 'foto' | 'reconstruido'
  entradas: number
  despachado: number
  facturadoSinGuia: number
  salidas: number
  /** entradas / salidas; null si no hubo salidas. */
  bookToBill: number | null
  /** Backlog / promedio mensual de salidas de los 3 meses que terminan en el cierre del período. */
  cobertura: number | null
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
/** Monto en millones, como se lee en Chile: $12.404 MM. */
export function formatMM(valor: number | null | undefined): string {
  if (valor == null) return '—'
  const mm = valor / 1_000_000
  const signo = mm < 0 ? '−' : ''
  return `${signo}$${Math.abs(mm).toLocaleString('es-CL', { maximumFractionDigits: Math.abs(mm) < 10 ? 1 : 0 })} MM`
}

export const SIN_LINEA = 'Sin línea'
export const SIN_SUCURSAL = 'Sin sucursal'

// ---------------------------------------------------------------- fechas (texto ISO, sin zonas horarias)

function aFecha(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

function aIso(f: Date): string {
  return f.toISOString().slice(0, 10)
}

export function sumarDias(iso: string, dias: number): string {
  const f = aFecha(iso)
  f.setUTCDate(f.getUTCDate() + dias)
  return aIso(f)
}

export function sumarMeses(iso: string, meses: number): string {
  const f = aFecha(iso)
  const dia = f.getUTCDate()
  f.setUTCDate(1)
  f.setUTCMonth(f.getUTCMonth() + meses)
  const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate()
  f.setUTCDate(Math.min(dia, ultimo))
  return aIso(f)
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86_400_000)
}

/** Hoy en Chile (las fechas de SAP y de la foto diaria son de Chile). */
export function hoyChile(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
}

function inicioMes(iso: string): string {
  return iso.slice(0, 8) + '01'
}

function finMes(iso: string): string {
  const f = aFecha(inicioMes(iso))
  return aIso(new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)))
}

/** Lunes de la semana (semanas de lunes a domingo). */
function inicioSemana(iso: string): string {
  const dia = aFecha(iso).getUTCDay() // 0 domingo
  return sumarDias(iso, -((dia + 6) % 7))
}

export function etiquetaFechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${Number(d)} ${MESES[Number(m) - 1]} ${a.slice(2)}`
}

/** Períodos completos o en curso, del que contiene `desde` al que contiene `hoy`. */
export function generarPeriodos(gran: Granularidad, desde: string, hoy: string): Periodo[] {
  const salida: Periodo[] = []
  let inicio = gran === 'mes' ? inicioMes(desde) : inicioSemana(desde)
  while (inicio <= hoy) {
    const finReal = gran === 'mes' ? finMes(inicio) : sumarDias(inicio, 6)
    const enCurso = finReal >= hoy
    const [a, m] = inicio.split('-')
    salida.push({
      clave: inicio,
      etiqueta: gran === 'mes' ? `${MESES[Number(m) - 1]} ${a.slice(2)}` : etiquetaFechaCorta(inicio),
      inicio,
      fin: enCurso ? hoy : finReal,
      enCurso,
    })
    inicio = gran === 'mes' ? sumarMeses(inicio, 1) : sumarDias(inicio, 7)
  }
  return salida
}

// ---------------------------------------------------------------- índice por proyecto

interface Evento {
  fecha: string
  /** Suma al saldo: nota de venta y devolución positivas; guía y factura sin guía negativas. */
  delta: number
}

interface IndiceProyecto {
  eventos: Evento[] // ordenados por fecha
  acumulado: number[] // saldo acumulado tras cada evento
  notas: NotaVenta[] // ordenadas por fecha
  ultimaSalida: string | null
}

export interface Historia {
  proyectos: Map<string, ProyectoHist>
  indice: Map<string, IndiceProyecto>
  notas: NotaVenta[]
  movimientos: Movimiento[]
}

export function armarHistoria(proyectos: ProyectoHist[], notas: NotaVenta[], movimientos: Movimiento[]): Historia {
  const mapa = new Map(proyectos.map((p) => [p.codigo, p]))
  const indice = new Map<string, IndiceProyecto>()
  const obtener = (codigo: string) => {
    let i = indice.get(codigo)
    if (!i) {
      i = { eventos: [], acumulado: [], notas: [], ultimaSalida: null }
      indice.set(codigo, i)
    }
    return i
  }
  for (const n of notas) {
    const i = obtener(n.proyecto)
    i.notas.push(n)
    i.eventos.push({ fecha: n.fecha, delta: n.monto })
  }
  for (const m of movimientos) {
    const i = obtener(m.proyecto)
    i.eventos.push({ fecha: m.fecha, delta: m.tipo === 'devolucion' ? m.monto : -m.monto })
    if (m.tipo !== 'devolucion' && (!i.ultimaSalida || m.fecha > i.ultimaSalida)) i.ultimaSalida = m.fecha
  }
  for (const i of indice.values()) {
    i.eventos.sort((a, b) => a.fecha.localeCompare(b.fecha))
    i.notas.sort((a, b) => a.fecha.localeCompare(b.fecha))
    let s = 0
    i.acumulado = i.eventos.map((e) => (s += e.delta))
  }
  return { proyectos: mapa, indice, notas, movimientos }
}

/** Saldo acumulado hasta la fecha (inclusive), por búsqueda binaria. */
function saldoA(i: IndiceProyecto, fecha: string): number {
  let lo = 0
  let hi = i.eventos.length - 1
  let pos = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (i.eventos[mid].fecha <= fecha) {
      pos = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return pos < 0 ? 0 : i.acumulado[pos]
}

function abiertoEn(i: IndiceProyecto, fecha: string): boolean {
  return i.notas.some((n) => n.fecha <= fecha && (n.cierre == null || n.cierre > fecha))
}

/** Backlog reconstruido por proyecto a una fecha (solo proyectos con saldo > 0). */
export function backlogReconstruido(h: Historia, fecha: string, incluir: (codigo: string) => boolean): Map<string, number> {
  const salida = new Map<string, number>()
  for (const [codigo, i] of h.indice) {
    if (!incluir(codigo) || !abiertoEn(i, fecha)) continue
    const s = saldoA(i, fecha)
    if (s > 0) salida.set(codigo, s)
  }
  return salida
}

function backlogDeFoto(foto: FotoProyecto[], incluir: (codigo: string) => boolean): Map<string, number> {
  const salida = new Map<string, number>()
  for (const f of foto) if (incluir(f.proyecto) && f.saldo > 0) salida.set(f.proyecto, f.saldo)
  return salida
}

/** Backlog por proyecto a una fecha: de la foto si la hay, si no reconstruido. */
export function backlogEn(
  h: Historia,
  fecha: string,
  fotos: Map<string, FotoProyecto[]>,
  incluir: (codigo: string) => boolean,
): { porProyecto: Map<string, number>; fuente: 'foto' | 'reconstruido' } {
  const foto = fotos.get(fecha)
  if (foto) return { porProyecto: backlogDeFoto(foto, incluir), fuente: 'foto' }
  return { porProyecto: backlogReconstruido(h, fecha, incluir), fuente: 'reconstruido' }
}

function sumar(m: Map<string, number>): number {
  let t = 0
  for (const v of m.values()) t += v
  return t
}

// ---------------------------------------------------------------- flujos

export interface Flujos {
  entradas: number
  despachado: number
  facturadoSinGuia: number
}

/** Notas de venta nuevas, guías − devoluciones y facturas sin guía con fecha entre desde y hasta (inclusive). */
export function flujosEntre(h: Historia, desde: string, hasta: string, incluir: (codigo: string) => boolean): Flujos {
  const f: Flujos = { entradas: 0, despachado: 0, facturadoSinGuia: 0 }
  for (const n of h.notas) if (n.fecha >= desde && n.fecha <= hasta && incluir(n.proyecto)) f.entradas += n.monto
  for (const m of h.movimientos) {
    if (m.fecha < desde || m.fecha > hasta || !incluir(m.proyecto)) continue
    if (m.tipo === 'despacho') f.despachado += m.monto
    else if (m.tipo === 'devolucion') f.despachado -= m.monto
    else f.facturadoSinGuia += m.monto
  }
  return f
}

// ---------------------------------------------------------------- serie

export function serie(
  h: Historia,
  periodos: Periodo[],
  fotos: Map<string, FotoProyecto[]>,
  incluir: (codigo: string) => boolean,
): PuntoSerie[] {
  return periodos.map((p) => {
    const { porProyecto, fuente } = backlogEn(h, p.fin, fotos, incluir)
    const porLinea: Record<string, number> = {}
    const porSucursal: Record<string, number> = {}
    for (const [codigo, v] of porProyecto) {
      const pr = h.proyectos.get(codigo)
      const l = pr?.linea ?? SIN_LINEA
      const s = pr?.sucursal ?? SIN_SUCURSAL
      porLinea[l] = (porLinea[l] ?? 0) + v
      porSucursal[s] = (porSucursal[s] ?? 0) + v
    }
    const fl = flujosEntre(h, p.inicio, p.fin, incluir)
    const salidas = fl.despachado + fl.facturadoSinGuia
    const backlog = sumar(porProyecto)
    // Cobertura: promedio mensual de salidas de los últimos 3 meses (91 días) que terminan en el cierre
    const tres = flujosEntre(h, sumarDias(p.fin, -90), p.fin, incluir)
    const promedioMensual = (tres.despachado + tres.facturadoSinGuia) / 3
    return {
      periodo: p,
      backlog,
      porLinea,
      porSucursal,
      fuente,
      entradas: fl.entradas,
      despachado: fl.despachado,
      facturadoSinGuia: fl.facturadoSinGuia,
      salidas,
      bookToBill: salidas > 0 ? fl.entradas / salidas : null,
      cobertura: promedioMensual > 0 ? backlog / promedioMensual : null,
    }
  })
}

// ---------------------------------------------------------------- puente

export interface Puente {
  inicial: number
  entradas: number
  despachado: number
  facturadoSinGuia: number
  /** Cierres de notas de venta, proyectos que pasan a saldo ≤ 0 y diferencias entre foto y reconstrucción. */
  ajustes: number
  final: number
}

export function puente(
  h: Historia,
  desde: string,
  hasta: string,
  fotos: Map<string, FotoProyecto[]>,
  incluir: (codigo: string) => boolean,
): Puente {
  const inicial = sumar(backlogEn(h, sumarDias(desde, -1), fotos, incluir).porProyecto)
  const final = sumar(backlogEn(h, hasta, fotos, incluir).porProyecto)
  const fl = flujosEntre(h, desde, hasta, incluir)
  return {
    inicial,
    entradas: fl.entradas,
    despachado: fl.despachado,
    facturadoSinGuia: fl.facturadoSinGuia,
    ajustes: final - inicial - fl.entradas + fl.despachado + fl.facturadoSinGuia,
    final,
  }
}

// ---------------------------------------------------------------- antigüedad, detenidos, concentración

export const TRAMOS_ANTIGUEDAD = ['0–3 meses', '3–6 meses', '6–12 meses', 'Más de 12 meses'] as const

/** Antigüedad del backlog por fecha de nota de venta: lo pendiente se asigna a las notas más recientes
 *  (lo despachado consume primero las más antiguas). */
export function antiguedad(h: Historia, porProyecto: Map<string, number>, hoy: string): Record<string, number> {
  const tramos: Record<string, number> = Object.fromEntries(TRAMOS_ANTIGUEDAD.map((t) => [t, 0]))
  for (const [codigo, saldo] of porProyecto) {
    const notas = h.indice.get(codigo)?.notas ?? []
    let resto = saldo
    for (let k = notas.length - 1; k >= 0 && resto > 0; k--) {
      const n = notas[k]
      if (n.fecha > hoy || n.monto <= 0) continue
      const parte = Math.min(resto, n.monto)
      resto -= parte
      const dias = diasEntre(n.fecha, hoy)
      const tramo = dias <= 91 ? 0 : dias <= 182 ? 1 : dias <= 365 ? 2 : 3
      tramos[TRAMOS_ANTIGUEDAD[tramo]] += parte
    }
    // Saldo mayor que las notas (no debería): se cuenta en el tramo de la nota más antigua
    if (resto > 0 && notas.length > 0) {
      const dias = diasEntre(notas[0].fecha, hoy)
      tramos[TRAMOS_ANTIGUEDAD[dias <= 91 ? 0 : dias <= 182 ? 1 : dias <= 365 ? 2 : 3]] += resto
    }
  }
  return tramos
}

export interface ProyectoDetenido {
  codigo: string
  nombre: string
  cliente: string | null
  linea: string | null
  backlog: number
  ultimaSalida: string | null
  /** Primera nota de venta del proyecto (desde ahí se cuenta si nunca hubo despacho). */
  primeraNota: string | null
  /** Días desde la última guía o factura sin guía o, si nunca hubo, desde la primera nota de venta. */
  dias: number
}

/** Proyectos con backlog y sin guías ni facturas sin guía en más de `minimo` días. Si nunca se despachó, los
 *  días se cuentan desde la primera nota de venta (un proyecto recién contratado no está detenido). */
export function detenidos(h: Historia, porProyecto: Map<string, number>, hoy: string, minimo: number): ProyectoDetenido[] {
  const salida: ProyectoDetenido[] = []
  for (const [codigo, backlog] of porProyecto) {
    const i = h.indice.get(codigo)
    const ultima = i?.ultimaSalida ?? null
    const primeraNota = i?.notas[0]?.fecha ?? null
    const desde = ultima ?? primeraNota
    if (!desde) continue
    const dias = diasEntre(desde, hoy)
    if (dias <= minimo) continue
    const p = h.proyectos.get(codigo)
    salida.push({
      codigo,
      nombre: p?.nombre ?? codigo,
      cliente: p?.cliente ?? null,
      linea: p?.linea ?? null,
      backlog,
      ultimaSalida: ultima,
      primeraNota,
      dias,
    })
  }
  return salida.sort((a, b) => b.backlog - a.backlog)
}

export interface Concentracion {
  clave: string
  monto: number
  participacion: number
  acumulada: number
}

export function concentracion(
  h: Historia,
  porProyecto: Map<string, number>,
  por: 'cliente' | 'proyecto',
  top: number,
): { filas: Concentracion[]; resto: number; total: number } {
  const mapa = new Map<string, number>()
  for (const [codigo, v] of porProyecto) {
    const p = h.proyectos.get(codigo)
    const clave = por === 'cliente' ? p?.cliente ?? 'Sin cliente' : p?.nombre ?? codigo
    mapa.set(clave, (mapa.get(clave) ?? 0) + v)
  }
  const total = sumar(porProyecto)
  const orden = [...mapa.entries()].sort((a, b) => b[1] - a[1])
  let acumulado = 0
  const filas = orden.slice(0, top).map(([clave, monto]) => {
    acumulado += monto
    return { clave, monto, participacion: total > 0 ? monto / total : 0, acumulada: total > 0 ? acumulado / total : 0 }
  })
  return { filas, resto: total - acumulado, total }
}
