import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getProyectoId } from '@/lib/proyectoIds'
import type { ModuloRow, ParsedDashboardData } from '../lib/excelParser'
import { weekKey, weekLabel } from '../lib/format'
import { loadModulosDespachadosCount } from '../lib/supaData'

const BUCKET_DEFS = ['10–19%', '20–29%', '30–39%', '40–49%', '50–59%', '60–69%', '70–79%', '80–89%', '90–99%']

export function useModulosData(excelData: ParsedDashboardData | null) {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [despachadosCount, setDespachadosCount] = useState(0)

  useEffect(() => {
    let cancelado = false
    getProyectoId(proyectoSlug!).then((proyectoId) =>
      loadModulosDespachadosCount(proyectoId).then((n) => {
        if (!cancelado) setDespachadosCount(n)
      }),
    )
    return () => {
      cancelado = true
    }
  }, [proyectoSlug])

  return useMemo(() => {
    const modulos: ModuloRow[] = excelData?.modulos ?? []
    const curva = excelData?.curva ?? []
    const totalMod = modulos.length
    const terminados = modulos.filter((m) => m.termReal).length
    const enProceso = modulos.filter((m) => m.initReal && !m.termReal).length
    const totalIniciados = terminados + enProceso
    const avgAvance = totalMod ? (modulos.reduce((s, m) => s + (m.avance ?? 0), 0) / totalMod) * 100 : 0
    const listosPendDesp = Math.max(0, terminados - despachadosCount)

    const kpis = {
      avanceProm: avgAvance,
      terminados,
      pctTerminados: totalMod ? (terminados / totalMod) * 100 : null,
      enProceso,
      totalIniciados,
      pctIniciados: totalMod ? (totalIniciados / totalMod) * 100 : null,
      despachados: despachadosCount,
      listosPendDesp,
    }

    // Distribución 10-99% — excluye completados (mismo criterio que dashboard.html)
    const buckets: Record<string, number> = {}
    for (const b of BUCKET_DEFS) buckets[b] = 0
    for (const m of modulos) {
      if (m.termReal) continue
      const p = (m.avance ?? 0) * 100
      if (p >= 100) continue
      if (p >= 90) buckets['90–99%']++
      else if (p >= 80) buckets['80–89%']++
      else if (p >= 70) buckets['70–79%']++
      else if (p >= 60) buckets['60–69%']++
      else if (p >= 50) buckets['50–59%']++
      else if (p >= 40) buckets['40–49%']++
      else if (p >= 30) buckets['30–39%']++
      else if (p >= 20) buckets['20–29%']++
      else if (p >= 10) buckets['10–19%']++
    }
    const distribucionAvance = BUCKET_DEFS.map((b) => ({ bucket: b, cantidad: buckets[b] }))

    // Avance por torre — solo torres con al menos un módulo en proceso
    const torresActivas = new Set(modulos.filter((m) => m.initReal && !m.termReal).map((m) => String(m.torre ?? 'S/T')))
    const torreMap: Record<string, { sum: number; cnt: number }> = {}
    for (const m of modulos) {
      const t = String(m.torre ?? 'S/T')
      if (!torresActivas.has(t)) continue
      if (!torreMap[t]) torreMap[t] = { sum: 0, cnt: 0 }
      torreMap[t].sum += (m.avance ?? 0) * 100
      torreMap[t].cnt++
    }
    const avancePorTorre = Object.keys(torreMap)
      .sort()
      .map((t) => ({ torre: t, avance: +(torreMap[t].sum / torreMap[t].cnt).toFixed(2) }))

    // M² por semana (solo hasta hoy) — acumulado y diario
    const hoy = new Date()
    hoy.setHours(23, 59, 59, 999)
    const weekMap: Record<number, { realAcum: number; planAcum: number; realDia: number; planDia: number; last: (typeof curva)[number] }> = {}
    for (const r of curva) {
      const d = new Date(r.fecha as string)
      if (isNaN(d.getTime()) || d > hoy) continue
      const wk = weekKey(r.fecha)
      if (wk == null) continue
      if (!weekMap[wk]) weekMap[wk] = { realAcum: 0, planAcum: 0, realDia: 0, planDia: 0, last: r }
      weekMap[wk].last = r
      weekMap[wk].realDia += r.m2RealDiario || 0
      weekMap[wk].planDia += r.m2PlanDiario || 0
    }
    const weekKeys = Object.keys(weekMap).map(Number).sort((a, b) => a - b)
    const m2SemanalAcum = weekKeys.map((wk) => ({
      semana: weekLabel(wk),
      real: weekMap[wk].last.m2RealAcum || 0,
      plan: weekMap[wk].last.m2PlanAcum || 0,
    }))
    const m2SemanalDiario = weekKeys.map((wk) => ({
      semana: weekLabel(wk),
      real: weekMap[wk].realDia,
      plan: weekMap[wk].planDia,
    }))

    return { kpis, distribucionAvance, avancePorTorre, m2SemanalAcum, m2SemanalDiario, modulos }
  }, [excelData, despachadosCount])
}

export type ModulosData = ReturnType<typeof useModulosData>
