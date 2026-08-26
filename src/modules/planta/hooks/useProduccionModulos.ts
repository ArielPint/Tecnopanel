import { useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'
import { loadPlantaModulos, type PlantaModuloRow } from '../lib/supaData'
import {
  catProgress, moduloProgress, isModuloIniciado, isModuloTerminado,
  fechaInicioReal, fechaTerminoReal, fechaUltimoMovimiento,
  partidasPendientes, formatPartidasPendientes, CATEGORIAS, type Categoria,
} from '../lib/partidas'
import { parseDate } from '../lib/format'
import type { ParsedDashboardData } from '../lib/excelParser'

export interface ProduccionModulo {
  modulo: string
  torre: string
  tipo: string
  estadoModulo: string | null
  avance: number
  og: number
  san: number
  elec: number
  term: number
  iniciado: boolean
  terminado: boolean
  initReal: string | null
  termReal: string | null
  ultimoMov: string | null
  diasSinMov: number | null
  // Fechas planificadas — solo disponibles si hay un lachacra.xlsm cargado en la sesión (excelData).
  initTeorico: unknown
  termPlan: unknown
  diasRetraso: number
  catPend: string
  partidasPend: string
  nPendientes: number
}

function diasEntre(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}

function enriquecer(rows: PlantaModuloRow[], excelData: ParsedDashboardData | null): ProduccionModulo[] {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const planPorModulo = new Map<string, { initTeorico: unknown; termPlan: unknown }>()
  for (const m of excelData?.modulos ?? []) {
    const key = String(m.modulo ?? '').trim()
    if (key) planPorModulo.set(key, { initTeorico: m.initTeorico, termPlan: m.termPlan })
  }

  return rows.map((r) => {
    const nombre = String(r.nombre ?? '').trim()
    const iniciado = isModuloIniciado(r)
    // El checklist partida-por-partida casi nunca se completa a mano (ver useModulosTerminados.ts),
    // así que si el Excel ya marcó el módulo como terminado eso también cuenta.
    const terminado = isModuloTerminado(r) || r.estado_modulo === 'MODULO TERMINADO'
    const pend = partidasPendientes(r)
    const plan = planPorModulo.get(nombre)
    const termPlanDate = plan?.termPlan ? parseDate(plan.termPlan) : null
    const diasRetraso = !terminado && termPlanDate && termPlanDate < hoy ? diasEntre(hoy, termPlanDate) : 0
    const ultimoMov = fechaUltimoMovimiento(r)
    const diasSinMov = iniciado && !terminado && ultimoMov ? diasEntre(hoy, new Date(ultimoMov)) : null

    const catsPendientes = CATEGORIAS.filter((c) => pend.some((p) => p.cat === c.key)).map((c) => c.label)

    return {
      modulo: nombre,
      torre: String(r.torre ?? ''),
      tipo: String(r.tipo ?? ''),
      estadoModulo: r.estado_modulo,
      // Mismo fallback que `terminado`: si el Excel ya dio el modulo por terminado, el checklist
      // manual (probablemente vacio) no debe hacer bajar el % de avance ni el de cada categoria.
      avance: terminado ? 1 : moduloProgress(r),
      og: terminado ? 1 : catProgress(r, 'obra_gruesa' as Categoria),
      san: terminado ? 1 : catProgress(r, 'sanitario' as Categoria),
      elec: terminado ? 1 : catProgress(r, 'electrico' as Categoria),
      term: terminado ? 1 : catProgress(r, 'terminaciones' as Categoria),
      iniciado,
      terminado,
      initReal: fechaInicioReal(r),
      termReal: terminado ? fechaTerminoReal(r) : null,
      ultimoMov,
      diasSinMov,
      initTeorico: plan?.initTeorico ?? null,
      termPlan: plan?.termPlan ?? null,
      diasRetraso,
      catPend: catsPendientes.join(', '),
      partidasPend: formatPartidasPendientes(pend),
      nPendientes: pend.length,
    }
  })
}

export function useProduccionModulos(excelData: ParsedDashboardData | null) {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  // Si el usuario tiene un subcontrato asociado (permiso "_subcontrato"), Producción
  // se restringe a solo los módulos de ese subcontrato (planta_modulos.subcontrato).
  const { subcontrato } = usePermisosProyecto(proyectoSlug ?? '')

  const fetcher = useCallback(async () => {
    const proyectoId = await getProyectoId(proyectoSlug!)
    return loadPlantaModulos(proyectoId)
  }, [proyectoSlug])

  const { data, loading } = useCachedQuery<PlantaModuloRow[]>(proyectoSlug ? `planta_modulos:${proyectoSlug}` : null, fetcher, 60_000)
  const todasLasRows = data ?? []
  const rows = useMemo(
    () => (subcontrato ? todasLasRows.filter((r) => r.subcontrato === subcontrato) : todasLasRows),
    [todasLasRows, subcontrato],
  )

  const modulos = useMemo(() => enriquecer(rows, excelData), [rows, excelData])

  // `rows` (estados/tiempos crudos) se exponen aparte de `modulos` (ya agregado por módulo)
  // porque Resumen/Partidas necesitan el detalle por partida individual (pS por código),
  // no solo el % agregado por categoría que trae ProduccionModulo.
  return { modulos, rows, loading }
}
