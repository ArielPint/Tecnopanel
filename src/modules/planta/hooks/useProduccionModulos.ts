import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getProyectoId } from '@/lib/proyectoIds'
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
      avance: moduloProgress(r),
      og: catProgress(r, 'obra_gruesa' as Categoria),
      san: catProgress(r, 'sanitario' as Categoria),
      elec: catProgress(r, 'electrico' as Categoria),
      term: catProgress(r, 'terminaciones' as Categoria),
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
  const [rows, setRows] = useState<PlantaModuloRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    getProyectoId(proyectoSlug!).then((proyectoId) =>
      loadPlantaModulos(proyectoId).then((r) => {
        if (!cancelado) {
          setRows(r)
          setLoading(false)
        }
      }),
    )
    return () => {
      cancelado = true
    }
  }, [proyectoSlug])

  const modulos = useMemo(() => enriquecer(rows, excelData), [rows, excelData])

  // `rows` (estados/tiempos crudos) se exponen aparte de `modulos` (ya agregado por módulo)
  // porque Resumen/Partidas necesitan el detalle por partida individual (pS por código),
  // no solo el % agregado por categoría que trae ProduccionModulo.
  return { modulos, rows, loading }
}
