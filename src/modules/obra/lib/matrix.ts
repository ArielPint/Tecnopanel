import { ASIGNACION_ORDER, ASIGNACION_POR_CR_CATEGORIA, CATEGORY_DEFS, VIEWC_ORDER_NORM, findCategoriaForPartida, normalize, type AsignacionCategoria, type ObraCategoria, type ObraSubcontrato } from './categorias'
import type { ChipEstado } from './crParser'
import type { ObraCrConfigDb, ObraCrModuloDb } from './supaData'

export interface AsignacionModulo {
  subcontrato: ObraSubcontrato | null
  fechaEntrega: string | null
  entregado: boolean
}

export type Asignaciones = Record<AsignacionCategoria, AsignacionModulo>

export interface ModuloCombinado {
  moduloNum: number
  code: string
  tipo: string
  estados: Record<string, ChipEstado>
  terminado: boolean
  asignaciones: Asignaciones
}

// Terminado = fila 20 del CR marcada "RF" (Recepción Final) para ese módulo —
// no se infiere del checklist de partidas porque hay columnas que quedan
// vacías/"no" aunque el módulo ya esté con recepción final.
export function isModuloTerminado(m: ModuloCombinado): boolean {
  return m.terminado
}

function asignacionesVacias(): Asignaciones {
  return Object.fromEntries(ASIGNACION_ORDER.map((cat) => [cat, { subcontrato: null, fechaEntrega: null, entregado: false }])) as Asignaciones
}

function primeraFecha(a: Asignaciones): string | null {
  const fechas = ASIGNACION_ORDER.map((cat) => a[cat].fechaEntrega).filter((f): f is string => !!f)
  return fechas.length ? fechas.sort()[0] : null
}

export function combinarModulos(modulos: ObraCrModuloDb[], config: ObraCrConfigDb[]): ModuloCombinado[] {
  const asignacionesPorModulo = new Map<number, Asignaciones>()
  for (const c of config) {
    const a = asignacionesPorModulo.get(c.modulo_num) ?? asignacionesVacias()
    a[c.categoria] = { subcontrato: c.subcontrato, fechaEntrega: c.fecha_entrega_final, entregado: c.entregado }
    asignacionesPorModulo.set(c.modulo_num, a)
  }

  return modulos
    .map((m) => ({
      moduloNum: m.modulo_num,
      code: m.code,
      tipo: m.tipo,
      estados: m.estados,
      terminado: m.terminado,
      asignaciones: asignacionesPorModulo.get(m.modulo_num) ?? asignacionesVacias(),
    }))
    .sort((a, b) => {
      const fa = primeraFecha(a.asignaciones)
      const fb = primeraFecha(b.asignaciones)
      if (fa && fb) return fa < fb ? -1 : 1
      if (fa) return -1
      if (fb) return 1
      return a.moduloNum - b.moduloNum
    })
}

// Nombres de partida (columna B cruda del CR) agrupados por categoría — se derivan
// de CATEGORY_DEFS normalizando contra las claves reales que trae cada módulo, ya
// que obra_cr_modulos.estados usa el nombre crudo de la partida como clave.
function partidasDeCategoria(cat: ObraCategoria, nombresDisponibles: Set<string>): string[] {
  const def = CATEGORY_DEFS[cat]
  const objetivo = new Set(def.partidas ?? [])
  return [...nombresDisponibles].filter((nombre) => objetivo.has(normalize(nombre)))
}

export interface CategoryTableRow {
  nombre: string
  cells: { status: ChipEstado }[]
}

export interface CategoryTable {
  rows: CategoryTableRow[]
  cols: ModuloCombinado[]
  done: number
  total: number
}

// Equivalente a buildCategoryMatrix() del html — solo entran los módulos que ya
// tienen fecha de entrega asignada en SU categoría de asignación (Configuración);
// si la categoría es splitTeam (wedo/conbes) también exige que el subcontrato
// asignado coincida con el del team de esta sección.
export function buildCategoryTable(cat: ObraCategoria, modulos: ModuloCombinado[]): CategoryTable {
  const def = CATEGORY_DEFS[cat]
  const nombresDisponibles = new Set(modulos.flatMap((m) => Object.keys(m.estados)))
  const partidaNames = partidasDeCategoria(cat, nombresDisponibles)

  const asigCat = ASIGNACION_POR_CR_CATEGORIA[cat]
  const cols = modulos.filter((m) => {
    const a = m.asignaciones[asigCat]
    if (!a.fechaEntrega) return false
    return def.splitTeam ? a.subcontrato === def.splitTeam : true
  })

  let done = 0
  let total = 0
  const rows: CategoryTableRow[] = partidaNames.map((nombre) => ({
    nombre,
    cells: cols.map((m) => {
      const status = m.estados[nombre] ?? 'na'
      if (status !== 'na') { total++; if (status === 'ok') done++ }
      return { status }
    }),
  }))

  return { rows, cols, done, total }
}

export interface ViewCPartidaCol {
  nombre: string
  categoria: ObraCategoria | 'wedo_conbes'
}

export interface ViewCData {
  partidas: ViewCPartidaCol[]
  modulos: ModuloCombinado[]
}

// Equivalente a la preparación de datos de renderViewC(): módulos en filas,
// partidas en columnas (orden fijo VIEWC_ORDER), agrupadas por categoría.
// Solo entran módulos con al menos 1 categoría de asignación con fecha puesta.
export function buildViewCData(modulos: ModuloCombinado[]): ViewCData {
  const conFecha = modulos.filter((m) => ASIGNACION_ORDER.some((cat) => m.asignaciones[cat].fechaEntrega))

  const nombresDisponibles = new Set(conFecha.flatMap((m) => Object.keys(m.estados)))
  const partidas: ViewCPartidaCol[] = [...nombresDisponibles]
    .map((nombre) => {
      const cat = findCategoriaForPartida(nombre)
      const categoria: ObraCategoria | 'wedo_conbes' = cat && 'wedoConbes' in cat ? 'wedo_conbes' : (cat as { single: ObraCategoria })?.single
      return { nombre, categoria }
    })
    .filter((p) => p.categoria)
    .sort((a, b) => {
      const ia = VIEWC_ORDER_NORM.indexOf(normalize(a.nombre))
      const ib = VIEWC_ORDER_NORM.indexOf(normalize(b.nombre))
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return 0
    })

  return { partidas, modulos: [...conFecha].sort((a, b) => a.moduloNum - b.moduloNum) }
}

export interface EntregaItem {
  moduloNum: number
  code: string
  categoria: AsignacionCategoria
  subcontrato: ObraSubcontrato | null
  fecha: string
  entregado: boolean
}

// Aplana las asignaciones de todos los módulos a una lista de entregas (una por
// categoría con fecha puesta) — insumo tanto del calendario de solo lectura
// (Entrega a Cliente) como del editable (Configuración).
export function buildEntregasFlat(modulos: ModuloCombinado[]): EntregaItem[] {
  const out: EntregaItem[] = []
  for (const m of modulos) {
    for (const cat of ASIGNACION_ORDER) {
      const a = m.asignaciones[cat]
      if (a.fechaEntrega) out.push({ moduloNum: m.moduloNum, code: m.code, categoria: cat, subcontrato: a.subcontrato, fecha: a.fechaEntrega, entregado: a.entregado })
    }
  }
  return out
}

export interface EntregaDia {
  fecha: string // YYYY-MM-DD
  items: EntregaItem[]
}

export interface EntregaSemana {
  inicio: string
  dias: EntregaDia[]
}

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function lunesDeSemana(fecha: Date): Date {
  const d = new Date(fecha)
  const dow = (d.getDay() + 6) % 7 // 0 = lunes
  d.setDate(d.getDate() - dow)
  d.setHours(0, 0, 0, 0)
  return d
}

// Arma la grilla semanal a partir de las entregas aplanadas (buildEntregasFlat).
export function buildEntregaSemanas(entregas: EntregaItem[]): EntregaSemana[] {
  if (!entregas.length) return []

  const porSemana = new Map<string, Map<string, EntregaItem[]>>()
  for (const item of entregas) {
    const fecha = new Date(item.fecha + 'T12:00:00')
    const inicio = lunesDeSemana(fecha).toISOString().slice(0, 10)
    if (!porSemana.has(inicio)) porSemana.set(inicio, new Map())
    const porDia = porSemana.get(inicio)!
    if (!porDia.has(item.fecha)) porDia.set(item.fecha, [])
    porDia.get(item.fecha)!.push(item)
  }

  return [...porSemana.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([inicio, porDia]) => {
      const inicioDate = new Date(inicio + 'T12:00:00')
      const dias: EntregaDia[] = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(inicioDate)
        d.setDate(d.getDate() + i)
        const fecha = d.toISOString().slice(0, 10)
        return { fecha, items: (porDia.get(fecha) ?? []).sort((a, b) => a.moduloNum - b.moduloNum) }
      })
      return { inicio, dias }
    })
}

export { DIAS_SEMANA }
