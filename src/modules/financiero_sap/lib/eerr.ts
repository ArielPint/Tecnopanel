import { SUCURSALES } from '@/lib/lineasNegocio'
import { GRUPOS, LINEAS } from './catalogos'
import type { Catalogos, Ceco, Cuenta, FilaEerr } from './api'

// Arma el estado de resultados a partir de las filas de fin_eerr: filtra, reparte en columnas y
// suma por el árbol del plan de cuentas. Sin React, para poder probarlo y reutilizarlo.

export type Columnas = 'mes' | 'linea' | 'sucursal'

export interface Filtros {
  sucursal: string | null
  linea: string | null
  ceco: string | null
  dim2: string | null
}

export const SIN_FILTROS: Filtros = { sucursal: null, linea: null, ceco: null, dim2: null }

export const SIN_CECO = '(sin CECO)'
export const SIN_SUCURSAL = 'Sin sucursal'

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function etiquetaMes(periodo: string): string {
  const [anio, mes] = periodo.split('-')
  return `${MESES_CORTOS[Number(mes) - 1]} ${anio}`
}

export function lineaDe(ceco: Ceco | undefined): string {
  return ceco?.linea ?? SIN_CECO
}

export function sucursalDe(ceco: Ceco | undefined): string {
  return ceco?.sucursal ?? SIN_SUCURSAL
}

/** ¿El CECO pasa los filtros de sucursal, línea y CECO? (la dimensión 2 va por fila). */
export function cecoPasa(codigo: string, ceco: Ceco | undefined, f: Filtros): boolean {
  if (f.ceco !== null && codigo !== f.ceco) return false
  if (f.linea !== null && lineaDe(ceco) !== f.linea) return false
  if (f.sucursal !== null && sucursalDe(ceco) !== f.sucursal) return false
  return true
}

export function claveColumna(fila: FilaEerr, ceco: Ceco | undefined, columnas: Columnas): string {
  if (columnas === 'mes') return fila.periodo.slice(0, 7)
  if (columnas === 'linea') return lineaDe(ceco)
  return sucursalDe(ceco)
}

export function etiquetaColumna(clave: string, columnas: Columnas): string {
  return columnas === 'mes' ? etiquetaMes(clave) : clave
}

function ordenColumnas(claves: Set<string>, columnas: Columnas): string[] {
  const lista = [...claves]
  if (columnas === 'mes') return lista.sort()
  const orden: readonly string[] = columnas === 'linea' ? [...LINEAS, SIN_CECO] : [...SUCURSALES, SIN_SUCURSAL]
  return lista.sort((a, b) => (orden.indexOf(a) + 1 || 99) - (orden.indexOf(b) + 1 || 99))
}

export interface Valores {
  /** Por clave de columna */
  col: Record<string, number>
  total: number
  /** Parte del total que viene de la administración repartida (sin asientos propios) */
  prorrateado: number
}

function vacio(): Valores {
  return { col: {}, total: 0, prorrateado: 0 }
}

function sumarEn(v: Valores, col: string, monto: number, prorrateado: boolean) {
  v.col[col] = (v.col[col] ?? 0) + monto
  v.total += monto
  if (prorrateado) v.prorrateado += monto
}

function sumarValores(destino: Valores, origen: Valores) {
  for (const [c, m] of Object.entries(origen.col)) destino.col[c] = (destino.col[c] ?? 0) + m
  destino.total += origen.total
  destino.prorrateado += origen.prorrateado
}

export type TipoFila = 'grupo' | 'nodo' | 'cuenta' | 'subtotal' | 'total'

export interface FilaInforme {
  id: string
  tipo: TipoFila
  nombre: string
  codigo: string | null
  /** Sangría visual (0 = grupo o subtotal) */
  profundidad: number
  valores: Valores
  /** Cuentas imputables que suman en esta fila (para ver sus asientos). Vacío en subtotales. */
  cuentas: string[]
  /** Id del padre visible, para contraer y expandir. null = siempre visible. */
  padreId: string | null
  tieneHijos: boolean
}

export interface Informe {
  columnas: string[]
  filas: FilaInforme[]
  /** Ingresos operacionales (grupo 4), base del % sobre ingresos */
  ingresos: Valores
  resultado: Valores
}

/** Filas de fin_eerr que pasan los filtros. */
export function filtrar(filas: FilaEerr[], cecos: Map<string, Ceco>, f: Filtros): FilaEerr[] {
  return filas.filter((r) => (f.dim2 === null || r.dim2 === f.dim2) && cecoPasa(r.ceco, cecos.get(r.ceco), f))
}

export function armarInforme(filas: FilaEerr[], cat: Catalogos, columnas: Columnas): Informe {
  const cecos = new Map(cat.cecos.map((c) => [c.codigo, c]))
  const cuentas = new Map(cat.cuentas.map((c) => [c.codigo, c]))
  const hijos = new Map<string, Cuenta[]>()
  for (const c of cat.cuentas) {
    if (!c.padre) continue
    hijos.set(c.padre, [...(hijos.get(c.padre) ?? []), c])
  }
  for (const lista of hijos.values()) lista.sort((a, b) => (a.codigo_formato ?? a.codigo).localeCompare(b.codigo_formato ?? b.codigo))

  // valores de cada cuenta imputable
  const porCuenta = new Map<string, Valores>()
  const claves = new Set<string>()
  for (const r of filas) {
    const col = claveColumna(r, cecos.get(r.ceco), columnas)
    claves.add(col)
    let v = porCuenta.get(r.cuenta)
    if (!v) porCuenta.set(r.cuenta, (v = vacio()))
    sumarEn(v, col, r.monto, r.prorrateado)
  }

  const resultado: FilaInforme[] = []
  const totalGrupo = new Map<number, Valores>()

  // Recorre el árbol desde la raíz del grupo. Los niveles 1 a 3 repiten el nombre del grupo: se
  // saltan y sus hijos cuelgan directo del grupo. Solo se muestran las ramas con movimiento.
  function rama(c: Cuenta, padreId: string, profundidad: number): { filas: FilaInforme[]; valores: Valores; hojas: string[] } {
    const propios = porCuenta.get(c.codigo)
    const valores = vacio()
    const hojas: string[] = []
    const sub: FilaInforme[] = []
    if (propios) {
      sumarValores(valores, propios)
      hojas.push(c.codigo)
    }
    const salta = c.nivel <= 3
    const id = `c:${c.codigo}`
    for (const h of hijos.get(c.codigo) ?? []) {
      const r = rama(h, salta ? padreId : id, salta ? profundidad : profundidad + 1)
      if (r.hojas.length === 0) continue
      sumarValores(valores, r.valores)
      hojas.push(...r.hojas)
      sub.push(...r.filas)
    }
    if (salta || hojas.length === 0) return { filas: sub, valores, hojas }
    const fila: FilaInforme = {
      id,
      tipo: c.imputable ? 'cuenta' : 'nodo',
      nombre: c.nombre,
      codigo: c.codigo_formato,
      profundidad,
      valores,
      cuentas: hojas,
      padreId,
      tieneHijos: sub.length > 0,
    }
    return { filas: [fila, ...sub], valores, hojas }
  }

  const subtotal = (id: string, nombre: string, grupos: number[], tipo: TipoFila = 'subtotal'): FilaInforme => {
    const valores = vacio()
    for (const g of grupos) {
      const t = totalGrupo.get(g)
      if (t) sumarValores(valores, t)
    }
    return { id, tipo, nombre, codigo: null, profundidad: 0, valores, cuentas: [], padreId: null, tieneHijos: false }
  }

  for (const { grupo, nombre } of GRUPOS) {
    const raices = cat.cuentas.filter((c) => c.grupo === grupo && !(c.padre && cuentas.get(c.padre)?.grupo === grupo))
    const valores = vacio()
    const hojas: string[] = []
    const sub: FilaInforme[] = []
    const id = `g:${grupo}`
    for (const raiz of raices) {
      const r = rama(raiz, id, 1)
      sumarValores(valores, r.valores)
      hojas.push(...r.hojas)
      sub.push(...r.filas)
    }
    totalGrupo.set(grupo, valores)
    resultado.push({ id, tipo: 'grupo', nombre, codigo: null, profundidad: 0, valores, cuentas: hojas, padreId: null, tieneHijos: sub.length > 0 }, ...sub)
    if (grupo === 5) resultado.push(subtotal('s:margen', 'Margen bruto', [4, 5]))
    if (grupo === 6) resultado.push(subtotal('s:operacional', 'Resultado operacional', [4, 5, 6]))
  }
  const total = subtotal('s:resultado', 'Resultado del periodo', [4, 5, 6, 7, 8], 'total')
  resultado.push(total)

  return { columnas: ordenColumnas(claves, columnas), filas: resultado, ingresos: totalGrupo.get(4) ?? vacio(), resultado: total.valores }
}

export interface ResumenLinea {
  linea: string
  sucursal: string | null
  ingresos: number
  costos: number
  gastos: number
  otros: number
  margen: number
  resultado: number
  /** Administración recibida por prorrateo (incluida en los montos de arriba) */
  prorrateado: number
}

/** Resumen por línea de negocio (y por sucursal si se pide), a partir de filas ya filtradas. */
export function resumenPorLinea(filas: FilaEerr[], cat: Catalogos, porSucursal: boolean): ResumenLinea[] {
  const cecos = new Map(cat.cecos.map((c) => [c.codigo, c]))
  const grupo = new Map(cat.cuentas.map((c) => [c.codigo, c.grupo]))
  const mapa = new Map<string, ResumenLinea>()
  for (const r of filas) {
    const ceco = cecos.get(r.ceco)
    const linea = lineaDe(ceco)
    const sucursal = porSucursal ? sucursalDe(ceco) : null
    const clave = `${linea}|${sucursal ?? ''}`
    let x = mapa.get(clave)
    if (!x) mapa.set(clave, (x = { linea, sucursal, ingresos: 0, costos: 0, gastos: 0, otros: 0, margen: 0, resultado: 0, prorrateado: 0 }))
    const g = grupo.get(r.cuenta)
    if (g === 4) x.ingresos += r.monto
    else if (g === 5) x.costos += r.monto
    else if (g === 6) x.gastos += r.monto
    else x.otros += r.monto
    x.resultado += r.monto
    if (r.prorrateado) x.prorrateado += r.monto
  }
  const orden: readonly string[] = [...LINEAS, SIN_CECO]
  const suc: readonly string[] = [...SUCURSALES, SIN_SUCURSAL]
  return [...mapa.values()]
    .map((x) => ({ ...x, margen: x.ingresos + x.costos }))
    .sort((a, b) => orden.indexOf(a.linea) - orden.indexOf(b.linea) || suc.indexOf(a.sucursal ?? '') - suc.indexOf(b.sucursal ?? ''))
}
