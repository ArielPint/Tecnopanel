import { useEffect, useMemo, useState } from 'react'
import type { ParsedDashboardData } from '../lib/excelParser'
import { fmtDate, parseDate, weekKey, weekLabel } from '../lib/format'
import { getCompras, getHomeAvance } from './useResumenData'
import {
  loadAvanceEconProy,
  loadCompras,
  loadPptoCatalogo,
  loadPresupuestoTotal,
  loadRitmoProyeccion,
  type AvanceEconProyRow,
} from '../lib/supaData'

const RITMO_SEMANAS = 8
const MES_ABBR: Record<string, string> = {
  Enero: 'Ene', Febrero: 'Feb', Marzo: 'Mar', Abril: 'Abr', Mayo: 'May', Junio: 'Jun',
  Julio: 'Jul', Agosto: 'Ago', Septiembre: 'Sep', Octubre: 'Oct', Noviembre: 'Nov', Diciembre: 'Dic',
}

function torreNum(t: unknown): number | null {
  const n = parseInt(String(t).replace(/\D+/g, ''), 10)
  return isNaN(n) ? null : n
}

export function useProyeccionData(excelData: ParsedDashboardData | null) {
  const [supaCompras, setSupaCompras] = useState<ReturnType<typeof getCompras>>([])
  const [pptoCatalogo, setPptoCatalogo] = useState<Record<string, number>>({})
  const [presupuestoTotal, setPresupuestoTotal] = useState<number | null>(null)
  const [avanceProy, setAvanceProy] = useState<AvanceEconProyRow[]>([])
  const [ritmoTope, setRitmoTope] = useState(15)
  const [ritmoTorre3, setRitmoTorre3] = useState(6)
  const [torreSel, setTorreSel] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    Promise.all([
      loadCompras(), loadPptoCatalogo(), loadPresupuestoTotal(),
      loadAvanceEconProy(new Date().getFullYear()), loadRitmoProyeccion(),
    ]).then(([compras, catalogo, ppto, proy, ritmo]) => {
      if (cancelado) return
      setSupaCompras(compras)
      setPptoCatalogo(catalogo)
      setPresupuestoTotal(ppto)
      setAvanceProy(proy)
      setRitmoTope(ritmo.ritmoTope)
      setRitmoTorre3(ritmo.ritmoTorre3)
    })
    return () => {
      cancelado = true
    }
  }, [])

  return useMemo(() => {
    const m = excelData?.modulos ?? []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const limite = new Date(today)
    limite.setDate(limite.getDate() - RITMO_SEMANAS * 7)

    const totalF = m.length
    const termFechas = m
      .map((x) => (x.termReal ? parseDate(x.termReal) : null))
      .filter((d): d is Date => !!d && !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())
    const terminadosF = termFechas.length
    const pendientesF = totalF - terminadosF
    const sinIniciarF = m.filter((x) => !x.initReal).length

    const torresConTermino = [...new Set(m.filter((x) => x.termReal).map((x) => String(x.torre)).filter(Boolean))].sort(
      (a, b) => (torreNum(a) ?? 0) - (torreNum(b) ?? 0),
    )

    function ritmoTorre(t: string): number {
      if (t === 'TORRE 03') return ritmoTorre3
      const fechasT = m
        .filter((x) => String(x.torre) === t && x.termReal)
        .map((x) => parseDate(x.termReal))
        .filter((d): d is Date => !!d && !isNaN(d.getTime()))
      return fechasT.filter((d) => d >= limite && d <= today).length / RITMO_SEMANAS
    }

    const escenarios = torresConTermino.map((t) => {
      const ritmo = Math.min(ritmoTorre(t), ritmoTope)
      const semanas = ritmo > 0 ? pendientesF / ritmo : null
      const fecha = semanas != null ? new Date(today.getTime() + semanas * 7 * 86400000) : null
      return { torre: t, ritmo, semanas, fecha }
    })

    const torreActual = torreSel && torresConTermino.includes(torreSel) ? torreSel : (torresConTermino[0] ?? null)
    const escenarioSel = escenarios.find((e) => e.torre === torreActual) ?? null
    const fechaEtaTotal = escenarioSel?.fecha ?? null

    // ── Económico: proyección manual vs burn rate real (últimos 3 meses) ──
    const ha = getHomeAvance(getCompras(supaCompras, excelData?.detalleGD ?? [], pptoCatalogo), avanceProy, presupuestoTotal, excelData?.homeAvance ?? [])
    const curMes = today.getMonth() + 1
    const haLabels = ha.map((x) => MES_ABBR[String(x.mes)] ?? String(x.mes).slice(0, 3))
    const haReal = ha.map((x) => (x.avEcon != null ? +(x.avEcon * 100).toFixed(2) : null))
    const haProyManual = ha.map((x) => (x.avEconProy != null ? +(x.avEconProy * 100).toFixed(2) : null))

    const realesPasados = ha.map((x, i) => ({ mesN: i + 1, frac: x.avEcon })).filter((x) => x.frac != null && x.mesN <= curMes)
    const ultimos3 = realesPasados.slice(-3)
    const burnMensual = ultimos3.length ? ultimos3.reduce((s, x) => s + (x.frac ?? 0), 0) / ultimos3.length : 0
    const haBurn = ha.map((_x, i) => (i + 1 > curMes && burnMensual > 0 ? +(burnMensual * 100).toFixed(2) : null))

    let sumReal = 0
    let sumManual = 0
    let sumBurn = 0
    let mesAgotamiento: string | null = null
    const econMensual = haLabels.map((mes, i) => {
      if (haReal[i] != null) sumReal += haReal[i] as number
      if (haProyManual[i] != null) sumManual += haProyManual[i] as number
      const burnVal = i + 1 <= curMes ? haReal[i] : haBurn[i]
      if (burnVal != null) {
        sumBurn += burnVal
        if (mesAgotamiento == null && sumBurn >= 100) mesAgotamiento = mes
      }
      return {
        mes, real: haReal[i], proyectado: haProyManual[i], burn: haBurn[i],
        realAcum: haReal[i] != null ? +sumReal.toFixed(2) : null,
        proyAcum: haProyManual[i] != null ? +sumManual.toFixed(2) : null,
        burnAcum: burnVal != null ? +sumBurn.toFixed(2) : null,
      }
    })

    // ── Chart: proyección término total (semanal, real acumulado vs lineal hasta ETA) ──
    // ponytail: proyección lineal entre hoy y fecha ETA, no simula aceleración/desaceleración de curva-S
    const weekSet = new Set(termFechas.map((d) => weekKey(d)).filter((w): w is number => w != null))
    const todayWk = weekKey(today) as number
    weekSet.add(todayWk)
    if (fechaEtaTotal) weekSet.add(weekKey(fechaEtaTotal) as number)
    let weeks: number[] = []
    if (weekSet.size) {
      const sorted = [...weekSet].sort((a, b) => a - b)
      const lastMs = sorted[sorted.length - 1]
      let d = new Date(sorted[0])
      while (d.getTime() <= lastMs) {
        weeks.push(d.getTime())
        d = new Date(d)
        d.setDate(d.getDate() + 7)
      }
      if (weeks[weeks.length - 1] !== lastMs) weeks.push(lastMs)
    }
    const etaWk = fechaEtaTotal ? (weekKey(fechaEtaTotal) as number) : null
    const proyeccionTermino = weeks.map((w) => {
      const realCum = w > todayWk ? null : termFechas.filter((d) => (weekKey(d) as number) <= w).length
      let proj: number | null = null
      if (etaWk != null && w >= todayWk) {
        if (w >= etaWk) proj = totalF
        else {
          const frac = etaWk > todayWk ? (w - todayWk) / (etaWk - todayWk) : 1
          proj = +(terminadosF + frac * (totalF - terminadosF)).toFixed(1)
        }
      }
      return { semana: weekLabel(w), real: realCum, proyeccion: proj }
    })

    return {
      kpis: {
        fechaEtaTotal: fechaEtaTotal ? fmtDate(fechaEtaTotal) : '—',
        torreEscenario: escenarioSel?.torre ?? null,
        ritmoEscenario: escenarioSel?.ritmo ?? null,
        pendientesF, sinIniciarF,
        semanasRestantes: escenarioSel?.semanas ?? null,
        mesAgotamiento, burnMensual,
      },
      torresConTermino, torreSel: torreActual, setTorreSel,
      escenarios, proyeccionTermino, econMensual,
    }
  }, [excelData, supaCompras, pptoCatalogo, presupuestoTotal, avanceProy, ritmoTope, ritmoTorre3, torreSel])
}

export type ProyeccionData = ReturnType<typeof useProyeccionData>
