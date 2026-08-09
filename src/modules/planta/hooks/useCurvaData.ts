import { useMemo, useState } from 'react'
import type { ParsedDashboardData } from '../lib/excelParser'
import { businessDaysBetween, parseDate, weekKey, weekLabel } from '../lib/format'

const MN: Record<number, string> = { 1: 'Ene', 2: 'Feb', 3: 'Mar', 4: 'Abr', 5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Ago', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dic' }

function natCompare(a: string, b: string) {
  return a.localeCompare(b, 'es', { numeric: true })
}

function ym(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function useCurvaData(excelData: ParsedDashboardData | null) {
  const [mesesSeleccionados, setMesesSeleccionados] = useState<Set<string> | null>(null)
  const [torresSeleccionadas, setTorresSeleccionadas] = useState<Set<string> | null>(null)

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(23, 59, 59, 999)
    return d
  }, [])

  const curva = excelData?.curva ?? []
  const modulos = excelData?.modulos ?? []
  const avplan = excelData?.avplan ?? []
  const membranaCielo = excelData?.membranaCielo ?? []

  const mesesDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const r of curva) {
      const d = parseDate(r.fecha)
      if (d && d <= today) set.add(ym(d))
    }
    return [...set].sort().map((key) => {
      const [y, m] = key.split('-')
      return { key, lbl: `${MN[+m]} ${y}` }
    })
  }, [curva, today])

  const torresDisponibles = useMemo(
    () => [...new Set(modulos.map((m) => String(m.torre ?? '')).filter(Boolean))].sort(natCompare),
    [modulos],
  )

  function toggleMes(key: string) {
    setMesesSeleccionados((cur) => {
      const base = cur ?? new Set(mesesDisponibles.map((m) => m.key))
      const next = new Set(base)
      next.has(key) ? next.delete(key) : next.add(key)
      return next.size === mesesDisponibles.length ? null : next
    })
  }
  function toggleTorre(t: string) {
    setTorresSeleccionadas((cur) => {
      const base = cur ?? new Set(torresDisponibles)
      const next = new Set(base)
      next.has(t) ? next.delete(t) : next.add(t)
      return next.size === torresDisponibles.length ? null : next
    })
  }

  return useMemo(() => {
    const curvaHoy = curva.filter((r) => {
      const d = parseDate(r.fecha)
      return d && d <= today
    })
    const lastReal = [...curvaHoy].reverse().find((r) => r.real != null && r.real > 0)
    const lastTeo = [...curvaHoy].reverse().find((r) => r.teorico != null && r.teorico > 0)
    const realPct = lastReal ? (lastReal.real ?? 0) * 100 : 0
    const teoPct = lastTeo ? (lastTeo.teorico ?? 0) * 100 : 0
    const modsActivos = modulos.filter((m) => m.initReal && !m.termReal).length
    const modsIniciados = modulos.filter((m) => m.initReal).length
    const modsTerminados = modulos.filter((m) => m.termReal).length
    const avHoy = avplan.filter((r) => {
      const d = parseDate(r.fecha)
      return d && d <= today
    })
    const lastAvPlan = [...avHoy].reverse().find((r) => r.termPlanAcum != null && r.termPlanAcum > 0)
    const termPlanHoy = lastAvPlan ? Math.round(lastAvPlan.termPlanAcum ?? 0) : 0
    const brechaTerms = modsTerminados - termPlanHoy

    const kpis = { realPct, teoPct, brechaTerms, termPlanHoy, modsActivos, modsIniciados, modsTerminados }

    const dentroFiltroMes = (d: Date) => mesesSeleccionados == null || mesesSeleccionados.has(ym(d))

    const curvaF = curva.filter((r) => {
      const d = parseDate(r.fecha)
      return d && d <= today && dentroFiltroMes(d)
    })
    const avF = avplan.filter((r) => {
      const d = parseDate(r.fecha)
      return d && d <= today && dentroFiltroMes(d)
    })

    const curvaWeeks = new Map<number, typeof curva>()
    for (const r of curvaF) {
      const d = parseDate(r.fecha)
      if (!d) continue
      const wk = weekKey(d)
      if (wk == null) continue
      if (!curvaWeeks.has(wk)) curvaWeeks.set(wk, [])
      curvaWeeks.get(wk)!.push(r)
    }
    const curvaByWeek = [...curvaWeeks.entries()]
      .sort(([a], [b]) => a - b)
      .map(([wk, rows]) => {
        const last = rows[rows.length - 1]
        return {
          semana: weekLabel(wk),
          teorico: last.teorico ? +((last.teorico ?? 0) * 100).toFixed(4) : 0,
          real: last.real ? +((last.real ?? 0) * 100).toFixed(4) : 0,
        }
      })

    const avWeeks = new Map<number, { rows: typeof avplan; initPlan: number; initReal: number }>()
    for (const r of avF) {
      const d = parseDate(r.fecha)
      if (!d) continue
      const wk = weekKey(d)
      if (wk == null) continue
      if (!avWeeks.has(wk)) avWeeks.set(wk, { rows: [], initPlan: 0, initReal: 0 })
      const w = avWeeks.get(wk)!
      w.rows.push(r)
      w.initPlan += r.initPlan || 0
      w.initReal += r.initReal || 0
    }
    const avByWeek = [...avWeeks.entries()]
      .sort(([a], [b]) => a - b)
      .map(([wk, w]) => {
        const last = w.rows[w.rows.length - 1]
        return {
          semana: weekLabel(wk),
          planAcum: last.planAcum || 0,
          realAcum: last.realAcum || 0,
          termPlanAcum: last.termPlanAcum || 0,
          termRealAcum: last.termRealAcum || 0,
        }
      })

    const galponF = membranaCielo.filter((r) => {
      const d = parseDate(r.membranaFecha)
      return d && d <= today && dentroFiltroMes(d)
    })
    const galponWeeks = new Map<number, number>()
    for (const r of galponF) {
      const d = parseDate(r.membranaFecha)
      if (!d) continue
      const wk = weekKey(d)
      if (wk == null) continue
      galponWeeks.set(wk, (galponWeeks.get(wk) || 0) + 1)
    }
    const galponByWeek = [...galponWeeks.entries()].sort(([a], [b]) => a - b).map(([wk, count]) => ({ semana: weekLabel(wk), count }))

    const terminadosF = modulos.filter((m) => {
      const d = parseDate(m.termReal)
      return d && d <= today && dentroFiltroMes(d)
    })
    const terminadosWeeks = new Map<number, number>()
    for (const m of terminadosF) {
      const d = parseDate(m.termReal)
      if (!d) continue
      const wk = weekKey(d)
      if (wk == null) continue
      terminadosWeeks.set(wk, (terminadosWeeks.get(wk) || 0) + 1)
    }
    const terminadosByWeek = [...terminadosWeeks.entries()].sort(([a], [b]) => a - b).map(([wk, count]) => ({ semana: weekLabel(wk), count }))

    // Tiempo por torre — no afectado por filtros (igual que el original)
    const modsTorreAll = modulos.filter((m) => m.initReal && (m.avance ?? 0) >= 0.99 && (m.tiempoReal ?? 0) > 0)
    const torreTiempoMap = new Map<string, { realSum: number; realCnt: number; proySum: number; proyCnt: number }>()
    for (const m of modsTorreAll) {
      const t = String(m.torre ?? 'S/T')
      if (!torreTiempoMap.has(t)) torreTiempoMap.set(t, { realSum: 0, realCnt: 0, proySum: 0, proyCnt: 0 })
      const g = torreTiempoMap.get(t)!
      g.realSum += m.tiempoReal ?? 0
      g.realCnt++
      if ((m.tiempoProy ?? 0) > 0) {
        g.proySum += m.tiempoProy ?? 0
        g.proyCnt++
      }
    }
    const torreTiempo = [...torreTiempoMap.keys()].sort(natCompare).map((t) => {
      const g = torreTiempoMap.get(t)!
      return {
        torre: t,
        real: +(g.realSum / g.realCnt).toFixed(1),
        proy: g.proyCnt ? +(g.proySum / g.proyCnt).toFixed(1) : null,
      }
    })

    const modsF = modulos.filter((m) => {
      if (!m.initReal) return false
      if (torresSeleccionadas != null && !torresSeleccionadas.has(String(m.torre ?? ''))) return false
      if (mesesSeleccionados != null) {
        const d = parseDate(m.initReal)
        if (!d) return false
        if (!mesesSeleccionados.has(ym(d))) return false
      }
      return true
    })

    function tiempoPorTipo(tipo: 'HUMEDO' | 'SECO') {
      const mods = modsF
        .filter((m) => String(m.tipo ?? '').toUpperCase() === tipo && m.initReal && (m.avance ?? 0) >= 0.99 && (m.tiempoReal ?? 0) > 0)
        .sort((a, b) => natCompare(String(a.modulo ?? ''), String(b.modulo ?? '')))
      const promedio = mods.length ? mods.reduce((s, m) => s + (m.tiempoReal ?? 0), 0) / mods.length : null
      return {
        promedio,
        data: mods.map((m) => ({
          modulo: String(m.modulo ?? '?'),
          real: Math.round(m.tiempoReal ?? 0),
          proy: (m.tiempoProy ?? 0) > 0 ? Math.round(m.tiempoProy ?? 0) : null,
        })),
      }
    }
    const tiempoHumedo = tiempoPorTipo('HUMEDO')
    const tiempoSeco = tiempoPorTipo('SECO')

    // Tabla ritmo por torre — filtrada por torre (no por mes), igual que el original
    const serieTermReal = new Map(modulos.map((m) => [m.serie, m.termReal]))
    const ritmoPorTorre = new Map<
      string,
      { pisoMin: Date | null; membranaMin: Date | null; membranaMax: Date | null; termMax: Date | null; total: number; pendientes: number }
    >()
    for (const r of membranaCielo) {
      if (torresSeleccionadas != null && !torresSeleccionadas.has(String(r.torre ?? ''))) continue
      const dMem = parseDate(r.membranaFecha)
      if (!dMem) continue
      const torre = String(r.torre ?? '')
      if (!ritmoPorTorre.has(torre)) {
        ritmoPorTorre.set(torre, { pisoMin: null, membranaMin: null, membranaMax: null, termMax: null, total: 0, pendientes: 0 })
      }
      const g = ritmoPorTorre.get(torre)!
      g.total += 1
      const dIni = parseDate(r.pisoFecha)
      if (dIni && (!g.pisoMin || dIni < g.pisoMin)) g.pisoMin = dIni
      if (!g.membranaMin || dMem < g.membranaMin) g.membranaMin = dMem
      if (!g.membranaMax || dMem > g.membranaMax) g.membranaMax = dMem
      const dTerm = parseDate(serieTermReal.get(r.serie))
      if (dTerm && (!g.termMax || dTerm > g.termMax)) g.termMax = dTerm
      else if (!dTerm) g.pendientes += 1
    }
    const ritmoTorreRows = [...ritmoPorTorre.entries()]
      .map(([torre, g]) => {
        const termEnd = g.pendientes > 0 ? (g.termMax && g.termMax > today ? g.termMax : today) : g.termMax
        const diasOG = g.pisoMin && g.membranaMax ? businessDaysBetween(g.pisoMin, g.membranaMax) : null
        const diasTerm = g.membranaMin && termEnd ? businessDaysBetween(g.membranaMin, termEnd) : null
        const diasTotal = g.pisoMin && termEnd ? businessDaysBetween(g.pisoMin, termEnd) : null
        return {
          torre, total: g.total,
          diasOG, promOG: diasOG ? g.total / diasOG : null,
          diasTerm, promTerm: diasTerm ? g.total / diasTerm : null,
          diasTotal,
          fechaMembrana: g.membranaMax, fechaTermino: g.termMax, enCurso: g.pendientes > 0,
        }
      })
      .filter((r) => r.diasOG != null || r.diasTerm != null)
      .sort((a, b) => natCompare(a.torre, b.torre))

    return {
      kpis, curvaByWeek, avByWeek, galponByWeek, terminadosByWeek, torreTiempo, tiempoHumedo, tiempoSeco, ritmoTorreRows,
      mesesDisponibles, mesesSeleccionados, toggleMes,
      torresDisponibles, torresSeleccionadas, toggleTorre,
    }
  }, [curva, modulos, avplan, membranaCielo, today, mesesSeleccionados, torresSeleccionadas, mesesDisponibles, torresDisponibles])
}

export type CurvaData = ReturnType<typeof useCurvaData>
