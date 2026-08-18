import { CATEGORY_DEFS, VIEWC_ORDER_NORM, findCategoriaForPartida, normalize, type ObraCategoria } from './categorias'
import type { ChipEstado } from './crParser'
import type { ObraCrConfigDb, ObraCrModuloDb } from './supaData'

export interface ModuloCombinado {
  moduloNum: number
  code: string
  tipo: string
  estados: Record<string, ChipEstado>
  subcontrato: 'W' | 'C' | null
  fechaEntregaFinal: string | null
}

export function combinarModulos(modulos: ObraCrModuloDb[], config: ObraCrConfigDb[]): ModuloCombinado[] {
  const configMap = new Map(config.map((c) => [c.modulo_num, c]))
  return modulos
    .map((m) => {
      const cfg = configMap.get(m.modulo_num)
      return {
        moduloNum: m.modulo_num,
        code: m.code,
        tipo: m.tipo,
        estados: m.estados,
        subcontrato: cfg?.subcontrato ?? null,
        fechaEntregaFinal: cfg?.fecha_entrega_final ?? null,
      }
    })
    .sort((a, b) => {
      if (a.fechaEntregaFinal && b.fechaEntregaFinal) return a.fechaEntregaFinal < b.fechaEntregaFinal ? -1 : 1
      if (a.fechaEntregaFinal) return -1
      if (b.fechaEntregaFinal) return 1
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

// Equivalente a buildCategoryMatrix() del html — para Wedo/Conbes solo entran los
// módulos con subcontrato asignado en Configuración (obra_cr_config.subcontrato);
// Eléctrico/Sanitario/Ventanas muestran todos los módulos del último CR subido.
export function buildCategoryTable(cat: ObraCategoria, modulos: ModuloCombinado[]): CategoryTable {
  const def = CATEGORY_DEFS[cat]
  const nombresDisponibles = new Set(modulos.flatMap((m) => Object.keys(m.estados)))
  const partidaNames = partidasDeCategoria(cat, nombresDisponibles)

  const cols = def.splitTeam ? modulos.filter((m) => m.subcontrato === def.splitTeam) : modulos

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
export function buildViewCData(modulos: ModuloCombinado[]): ViewCData {
  const nombresDisponibles = new Set(modulos.flatMap((m) => Object.keys(m.estados)))
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

  return { partidas, modulos: [...modulos].sort((a, b) => a.moduloNum - b.moduloNum) }
}

export interface EntregaDia {
  fecha: string // YYYY-MM-DD
  modulos: ModuloCombinado[]
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

// Reemplaza la grilla semanal que en el html original venía del Excel "Entrega
// Contratistas" — ahora se arma en el cliente a partir de fecha_entrega_final
// (obra_cr_config), cargada por semana/día directamente en la pestaña Configuración.
export function buildEntregaSemanas(modulos: ModuloCombinado[]): EntregaSemana[] {
  const conFecha = modulos.filter((m): m is ModuloCombinado & { fechaEntregaFinal: string } => !!m.fechaEntregaFinal)
  if (!conFecha.length) return []

  const porSemana = new Map<string, Map<string, ModuloCombinado[]>>()
  for (const m of conFecha) {
    const fecha = new Date(m.fechaEntregaFinal + 'T12:00:00')
    const inicio = lunesDeSemana(fecha).toISOString().slice(0, 10)
    if (!porSemana.has(inicio)) porSemana.set(inicio, new Map())
    const porDia = porSemana.get(inicio)!
    if (!porDia.has(m.fechaEntregaFinal)) porDia.set(m.fechaEntregaFinal, [])
    porDia.get(m.fechaEntregaFinal)!.push(m)
  }

  return [...porSemana.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([inicio, porDia]) => {
      const inicioDate = new Date(inicio + 'T12:00:00')
      const dias: EntregaDia[] = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(inicioDate)
        d.setDate(d.getDate() + i)
        const fecha = d.toISOString().slice(0, 10)
        return { fecha, modulos: (porDia.get(fecha) ?? []).sort((a, b) => a.moduloNum - b.moduloNum) }
      })
      return { inicio, dias }
    })
}

export { DIAS_SEMANA }
