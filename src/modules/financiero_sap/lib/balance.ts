import type { Catalogos, Cuenta, FilaBalance, MapeoIfrs, RubroIfrs } from './api'

// Arma el Balance general (estructura del plan de SAP) y el Estado de situación financiera IFRS a partir
// de fin_balance (saldo debe - haber por cuenta a una fecha de corte, más el resultado del ejercicio aún
// no cerrado). Se muestran en positivo: activos como debe - haber; pasivos y patrimonio como haber - debe.

/** Un corte: clave ('YYYY-MM') y las filas de fin_balance a esa fecha. */
export interface Corte {
  clave: string
  filas: FilaBalance[]
}

export type TipoFila = 'seccion' | 'nodo' | 'cuenta' | 'resultado' | 'subtotal' | 'total' | 'control'

export interface FilaEstado {
  id: string
  tipo: TipoFila
  nombre: string
  codigo: string | null
  profundidad: number
  /** Valor por corte (misma clave que Corte.clave), ya con el signo de su sección */
  valores: Record<string, number>
  /** Cuentas imputables que forman la fila (para ver movimientos) */
  cuentas: string[]
  padreId: string | null
  tieneHijos: boolean
  /** Signo para pasar de debe - haber a lo que se muestra: 1 activos, -1 pasivos y patrimonio */
  signo: 1 | -1
}

export const RESULTADO = 'Resultado del ejercicio'

const signoGrupo = (g: number): 1 | -1 => (g === 1 ? 1 : -1)

function sumar(destino: Record<string, number>, origen: Record<string, number>, factor = 1) {
  for (const [k, v] of Object.entries(origen)) destino[k] = (destino[k] ?? 0) + v * factor
}

/** Saldos (debe - haber) por cuenta y por corte, más el resultado del ejercicio por corte. */
function saldos(cortes: Corte[]) {
  const porCuenta = new Map<string, Record<string, number>>()
  const resultado: Record<string, number> = {}
  for (const c of cortes) {
    resultado[c.clave] = 0
    for (const f of c.filas) {
      if (f.cuenta === null) {
        resultado[c.clave] += Number(f.saldo)
        continue
      }
      let v = porCuenta.get(f.cuenta)
      if (!v) porCuenta.set(f.cuenta, (v = {}))
      v[c.clave] = (v[c.clave] ?? 0) + Number(f.saldo)
    }
  }
  return { porCuenta, resultado }
}

const NOMBRES_GRUPO: Record<number, string> = { 1: 'Activos', 2: 'Pasivos', 3: 'Patrimonio' }

/** Balance general con la estructura del plan de cuentas de SAP. */
export function armarBalance(cortes: Corte[], cat: Catalogos): FilaEstado[] {
  const { porCuenta, resultado } = saldos(cortes)
  const cuentas = new Map(cat.cuentas.map((c) => [c.codigo, c]))
  const hijos = new Map<string, Cuenta[]>()
  for (const c of cat.cuentas) {
    if (!c.padre) continue
    hijos.set(c.padre, [...(hijos.get(c.padre) ?? []), c])
  }
  for (const lista of hijos.values()) lista.sort((a, b) => (a.codigo_formato ?? a.codigo).localeCompare(b.codigo_formato ?? b.codigo, 'es', { numeric: true }))

  const filas: FilaEstado[] = []
  const totales: Record<number, Record<string, number>> = {}

  // Los niveles 1 y 2 repiten el nombre del grupo: se saltan. Solo ramas con saldo en algún corte.
  function rama(c: Cuenta, padreId: string, prof: number, signo: 1 | -1): { filas: FilaEstado[]; valores: Record<string, number>; hojas: string[] } {
    const valores: Record<string, number> = {}
    const hojas: string[] = []
    const sub: FilaEstado[] = []
    const propios = porCuenta.get(c.codigo)
    if (propios) {
      sumar(valores, propios, signo)
      hojas.push(c.codigo)
    }
    const salta = c.nivel <= 2
    const id = `c:${c.codigo}`
    for (const h of hijos.get(c.codigo) ?? []) {
      const r = rama(h, salta ? padreId : id, salta ? prof : prof + 1, signo)
      if (r.hojas.length === 0) continue
      sumar(valores, r.valores)
      hojas.push(...r.hojas)
      sub.push(...r.filas)
    }
    if (salta || hojas.length === 0) return { filas: sub, valores, hojas }
    const fila: FilaEstado = { id, tipo: c.imputable ? 'cuenta' : 'nodo', nombre: c.nombre, codigo: c.codigo_formato, profundidad: prof, valores, cuentas: hojas, padreId, tieneHijos: sub.length > 0, signo }
    return { filas: [fila, ...sub], valores, hojas }
  }

  for (const g of [1, 2, 3]) {
    const signo = signoGrupo(g)
    const id = `g:${g}`
    const raices = cat.cuentas.filter((c) => c.grupo === g && !(c.padre && cuentas.get(c.padre)?.grupo === g))
    const valores: Record<string, number> = {}
    const hojas: string[] = []
    const sub: FilaEstado[] = []
    for (const raiz of raices) {
      const r = rama(raiz, id, 1, signo)
      sumar(valores, r.valores)
      hojas.push(...r.hojas)
      sub.push(...r.filas)
    }
    // una cuenta con saldo que no esté en el catálogo no entra al árbol: se nota en la fila de diferencia
    if (g === 3) {
      sub.push({ id: 'resultado', tipo: 'resultado', nombre: RESULTADO, codigo: null, profundidad: 1, valores: Object.fromEntries(Object.entries(resultado).map(([k, v]) => [k, -v])), cuentas: [], padreId: id, tieneHijos: false, signo: -1 })
      sumar(valores, resultado, -1)
    }
    totales[g] = valores
    filas.push({ id, tipo: 'seccion', nombre: NOMBRES_GRUPO[g], codigo: null, profundidad: 0, valores, cuentas: hojas, padreId: null, tieneHijos: sub.length > 0, signo }, ...sub)
    filas.push({ id: `t:${g}`, tipo: 'subtotal', nombre: `Total ${NOMBRES_GRUPO[g].toLowerCase()}`, codigo: null, profundidad: 0, valores, cuentas: [], padreId: null, tieneHijos: false, signo })
  }
  const pyp: Record<string, number> = {}
  sumar(pyp, totales[2])
  sumar(pyp, totales[3])
  filas.push({ id: 't:pyp', tipo: 'total', nombre: 'Total pasivos y patrimonio', codigo: null, profundidad: 0, valores: pyp, cuentas: [], padreId: null, tieneHijos: false, signo: -1 })
  const dif: Record<string, number> = {}
  sumar(dif, totales[1])
  sumar(dif, pyp, -1)
  filas.push({ id: 't:control', tipo: 'control', nombre: 'Diferencia (activos − pasivos y patrimonio)', codigo: null, profundidad: 0, valores: dif, cuentas: [], padreId: null, tieneHijos: false, signo: 1 })
  return filas
}

export const SECCIONES_IFRS: { seccion: RubroIfrs['seccion']; nombre: string; signo: 1 | -1 }[] = [
  { seccion: 'activo_corriente', nombre: 'Activos corrientes', signo: 1 },
  { seccion: 'activo_no_corriente', nombre: 'Activos no corrientes', signo: 1 },
  { seccion: 'pasivo_corriente', nombre: 'Pasivos corrientes', signo: -1 },
  { seccion: 'pasivo_no_corriente', nombre: 'Pasivos no corrientes', signo: -1 },
  { seccion: 'patrimonio', nombre: 'Patrimonio', signo: -1 },
]

export const SIN_CLASIFICAR = '__sin'

/** Estado de situación financiera clasificado (NIC 1) con la clasificación de fin_ifrs_mapeo. */
export function armarIfrs(cortes: Corte[], cat: Catalogos, mapeo: MapeoIfrs[], rubros: RubroIfrs[]): FilaEstado[] {
  const { porCuenta, resultado } = saldos(cortes)
  const cuentas = new Map(cat.cuentas.map((c) => [c.codigo, c]))
  const rubroDe = new Map(mapeo.map((m) => [m.cuenta, m.rubro]))
  const seccionDe = new Map(rubros.map((r) => [r.codigo, r.seccion]))
  const ordenados = [...rubros].sort((a, b) => a.orden - b.orden)

  // cuentas por rubro (o sin clasificar, por sección según su grupo)
  const enRubro = new Map<string, string[]>()
  for (const cod of porCuenta.keys()) {
    const r = rubroDe.get(cod)
    const g = cuentas.get(cod)?.grupo ?? 0
    const clave = r && seccionDe.has(r) ? r : `${SIN_CLASIFICAR}:${g === 1 ? 'activo_corriente' : g === 2 ? 'pasivo_corriente' : 'patrimonio'}`
    enRubro.set(clave, [...(enRubro.get(clave) ?? []), cod])
  }

  const filas: FilaEstado[] = []
  const total: Record<string, Record<string, number>> = {}
  for (const s of SECCIONES_IFRS) {
    const id = `s:${s.seccion}`
    const valoresSeccion: Record<string, number> = {}
    const sub: FilaEstado[] = []
    const claves = [...ordenados.filter((r) => r.seccion === s.seccion).map((r) => r.codigo), `${SIN_CLASIFICAR}:${s.seccion}`]
    for (const clave of claves) {
      const lista = (enRubro.get(clave) ?? []).sort((a, b) => (cuentas.get(a)?.codigo_formato ?? a).localeCompare(cuentas.get(b)?.codigo_formato ?? b, 'es', { numeric: true }))
      const valores: Record<string, number> = {}
      const hijas: FilaEstado[] = []
      const rid = `r:${clave}`
      for (const cod of lista) {
        const v: Record<string, number> = {}
        sumar(v, porCuenta.get(cod) ?? {}, s.signo)
        sumar(valores, v)
        const c = cuentas.get(cod)
        hijas.push({ id: `c:${cod}`, tipo: 'cuenta', nombre: c?.nombre ?? cod, codigo: c?.codigo_formato ?? null, profundidad: 2, valores: v, cuentas: [cod], padreId: rid, tieneHijos: false, signo: s.signo })
      }
      const esGanancias = clave === 'pat_ganancias'
      if (esGanancias) {
        const v = Object.fromEntries(Object.entries(resultado).map(([k, x]) => [k, -x]))
        sumar(valores, v)
        hijas.push({ id: 'resultado', tipo: 'resultado', nombre: RESULTADO, codigo: null, profundidad: 2, valores: v, cuentas: [], padreId: rid, tieneHijos: false, signo: -1 })
      }
      if (hijas.length === 0) continue
      const sinClasificar = clave.startsWith(SIN_CLASIFICAR)
      const nombre = sinClasificar ? 'Cuentas sin clasificar' : rubros.find((r) => r.codigo === clave)?.nombre ?? clave
      sub.push({ id: rid, tipo: 'nodo', nombre, codigo: null, profundidad: 1, valores, cuentas: lista, padreId: id, tieneHijos: true, signo: s.signo }, ...hijas)
      sumar(valoresSeccion, valores)
    }
    total[s.seccion] = valoresSeccion
    filas.push({ id, tipo: 'seccion', nombre: s.nombre, codigo: null, profundidad: 0, valores: valoresSeccion, cuentas: [], padreId: null, tieneHijos: sub.length > 0, signo: s.signo }, ...sub)
    filas.push({ id: `t:${s.seccion}`, tipo: 'subtotal', nombre: `Total ${s.nombre.toLowerCase()}`, codigo: null, profundidad: 0, valores: valoresSeccion, cuentas: [], padreId: null, tieneHijos: false, signo: s.signo })
    if (s.seccion === 'activo_no_corriente') filas.push(totalDe('t:activos', 'Total activos', ['activo_corriente', 'activo_no_corriente']))
    if (s.seccion === 'pasivo_no_corriente') filas.push(totalDe('t:pasivos', 'Total pasivos', ['pasivo_corriente', 'pasivo_no_corriente']))
  }
  filas.push(totalDe('t:pyp', 'Total patrimonio y pasivos', ['pasivo_corriente', 'pasivo_no_corriente', 'patrimonio']))
  const dif: Record<string, number> = {}
  sumar(dif, total.activo_corriente)
  sumar(dif, total.activo_no_corriente)
  for (const s of ['pasivo_corriente', 'pasivo_no_corriente', 'patrimonio']) sumar(dif, total[s], -1)
  filas.push({ id: 't:control', tipo: 'control', nombre: 'Diferencia (activos − patrimonio y pasivos)', codigo: null, profundidad: 0, valores: dif, cuentas: [], padreId: null, tieneHijos: false, signo: 1 })
  return filas

  function totalDe(id: string, nombre: string, secciones: string[]): FilaEstado {
    const v: Record<string, number> = {}
    for (const s of secciones) sumar(v, total[s] ?? {})
    return { id, tipo: 'total', nombre, codigo: null, profundidad: 0, valores: v, cuentas: [], padreId: null, tieneHijos: false, signo: 1 }
  }
}
