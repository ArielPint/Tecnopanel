import { useEffect, useMemo, useState } from 'react'
import type { ParsedDashboardData } from '../lib/excelParser'
import { parseDate } from '../lib/format'
import { loadDespachos, type DespachoSupaRow } from '../lib/supaData'

const MES_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function mesKey(dt: Date) {
  return `${dt.getFullYear()}_${dt.getMonth() + 1}`
}
function mesLbl(dt: Date) {
  return `${MES_NAMES[dt.getMonth()]} ${dt.getFullYear()}`
}
function getISOWeek(dt: Date): string {
  const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yr = d.getUTCFullYear()
  const w = Math.ceil(((d.getTime() - Date.UTC(yr, 0, 1)) / 86400000 + 1) / 7)
  return `${yr}_${String(w).padStart(2, '0')}`
}
function semLbl(key: string): string {
  const [yr, wk] = key.split('_')
  const jan4 = new Date(Date.UTC(+yr, 0, 4))
  const mon = new Date(jan4.getTime() + ((+wk - 1) * 7 - (jan4.getUTCDay() || 7) + 1) * 86400000)
  return mon.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
}

interface DRow {
  fecha: unknown
  modulo: unknown
  torre: unknown
  tipo: unknown
  monto: number | null
}

export function useDespachosData(excelData: ParsedDashboardData | null) {
  const [supaDespachos, setSupaDespachos] = useState<DespachoSupaRow[]>([])
  const [mesesSeleccionados, setMesesSeleccionados] = useState<Set<string> | null>(null)

  useEffect(() => {
    let cancelado = false
    loadDespachos().then((rows) => {
      if (!cancelado) setSupaDespachos(rows)
    })
    return () => {
      cancelado = true
    }
  }, [])

  const d: DRow[] = useMemo(() => {
    if (supaDespachos.length) return supaDespachos
    return (excelData?.despachos ?? []).map((r) => ({ fecha: r.fecha, modulo: r.modulo, torre: r.torre, tipo: r.tipo, monto: r.monto }))
  }, [supaDespachos, excelData])

  const proy = excelData?.proyeccion ?? []

  const allMesKeys = useMemo(() => {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    const curMesOrd = today.getFullYear() * 12 + today.getMonth()
    const set = new Set<string>()
    for (const x of d) {
      const dt = parseDate(x.fecha)
      if (dt) set.add(mesKey(dt))
    }
    for (const x of proy) {
      const dt = parseDate(x.fecha)
      if (dt) set.add(mesKey(dt))
    }
    return [...set]
      .filter((k) => {
        const [y, m] = k.split('_').map(Number)
        return y * 12 + (m - 1) <= curMesOrd
      })
      .sort((a, b) => {
        const [ya, ma] = a.split('_').map(Number)
        const [yb, mb] = b.split('_').map(Number)
        return ya * 12 + ma - (yb * 12 + mb)
      })
  }, [d, proy])

  const mesesOpts = useMemo(
    () => allMesKeys.map((k) => {
      const [y, m] = k.split('_').map(Number)
      return { key: k, lbl: mesLbl(new Date(y, m - 1, 1)) }
    }),
    [allMesKeys],
  )

  function toggleMes(key: string) {
    setMesesSeleccionados((cur) => {
      const base = cur ?? new Set(allMesKeys)
      const next = new Set(base)
      next.has(key) ? next.delete(key) : next.add(key)
      return next.size === allMesKeys.length ? null : next
    })
  }

  return useMemo(() => {
    const today = new Date()
    today.setHours(23, 59, 59, 999)

    const totalMonto = d.reduce((s, x) => s + (x.monto ?? 0), 0)
    const nMods = new Set(d.map((x) => x.modulo).filter(Boolean)).size
    const modsTerminados = (excelData?.modulos ?? []).filter((m) => m.termReal).length

    const kpis = {
      nMods, totalGDs: d.length, totalMonto,
      montoPromMod: nMods ? totalMonto / nMods : 0, modsTerminados,
    }

    const filteredMesKeys = mesesSeleccionados ? allMesKeys.filter((k) => mesesSeleccionados.has(k)) : allMesKeys
    const filteredMesSet = new Set(filteredMesKeys)

    // ── Mensual (no afectado por el filtro, igual que el original) ──
    const realMes = new Map<string, { lbl: string; mods: Set<unknown> }>()
    for (const x of d) {
      const dt = parseDate(x.fecha)
      if (!dt) continue
      const k = mesKey(dt)
      if (!realMes.has(k)) realMes.set(k, { lbl: mesLbl(dt), mods: new Set() })
      if (x.modulo) realMes.get(k)!.mods.add(x.modulo)
    }
    const proyMes = new Map<string, { sum: number; acum: number; acumHoy: number }>()
    for (const x of proy) {
      const dt = parseDate(x.fecha)
      if (!dt) continue
      const k = mesKey(dt)
      if (!proyMes.has(k)) proyMes.set(k, { sum: 0, acum: 0, acumHoy: 0 })
      const e = proyMes.get(k)!
      e.sum += x.modulosDia || 0
      e.acum = Math.max(e.acum, x.modulosAcumulados || 0)
      if (dt <= today) e.acumHoy = Math.max(e.acumHoy, x.modulosAcumulados || 0)
    }
    const mensual = allMesKeys.map((k) => ({
      mes: realMes.get(k)?.lbl ?? mesLbl(new Date(+k.split('_')[0], +k.split('_')[1] - 1, 1)),
      despachado: realMes.get(k)?.mods.size ?? 0,
      proyectado: proyMes.get(k)?.sum ?? 0,
    }))

    // ── Semanal (filtrado por mes) ──
    const realSem = new Map<string, { lbl: string; mods: Set<unknown> }>()
    for (const x of d) {
      const dt = parseDate(x.fecha)
      if (!dt) continue
      if (!filteredMesSet.has(mesKey(dt))) continue
      const k = getISOWeek(dt)
      if (!realSem.has(k)) realSem.set(k, { lbl: semLbl(k), mods: new Set() })
      if (x.modulo) realSem.get(k)!.mods.add(x.modulo)
    }
    const proySem = new Map<string, { sum: number; acum: number }>()
    for (const x of proy) {
      const dt = parseDate(x.fecha)
      if (!dt) continue
      if (!filteredMesSet.has(mesKey(dt))) continue
      const k = getISOWeek(dt)
      if (!proySem.has(k)) proySem.set(k, { sum: 0, acum: 0 })
      const e = proySem.get(k)!
      e.sum += x.modulosDia || 0
      e.acum = Math.max(e.acum, x.modulosAcumulados || 0)
    }
    const curSemKey = getISOWeek(today)
    const allSemKeys = [...new Set([...realSem.keys(), ...proySem.keys()])].filter((k) => k <= curSemKey).sort()
    let acumSem = 0
    const semanal = allSemKeys.map((k) => {
      acumSem += realSem.get(k)?.mods.size ?? 0
      return {
        semana: realSem.get(k)?.lbl ?? semLbl(k),
        despachadoAcum: acumSem,
        proyectadoAcum: proySem.get(k)?.acum ?? 0,
        despachadoSemanal: realSem.get(k)?.mods.size ?? 0,
      }
    })

    // ── Diario (filtrado por mes) ──
    const realDia = new Map<number, { lbl: string; mods: Set<unknown> }>()
    for (const x of d) {
      const dt = parseDate(x.fecha)
      if (!dt) continue
      const ts = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
      if (!realDia.has(ts)) realDia.set(ts, { lbl: dt.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }), mods: new Set() })
      if (x.modulo) realDia.get(ts)!.mods.add(x.modulo)
    }
    const proyDia = new Map<number, { lbl: string; acum: number }>()
    for (const x of proy) {
      const dt = parseDate(x.fecha)
      if (!dt) continue
      const ts = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
      if (!proyDia.has(ts)) proyDia.set(ts, { lbl: dt.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }), acum: 0 })
      proyDia.get(ts)!.acum = Math.max(proyDia.get(ts)!.acum, x.modulosAcumulados || 0)
    }
    const allDiaKeys = [...new Set([...realDia.keys(), ...proyDia.keys()])]
      .filter((ts) => {
        if (ts > today.getTime()) return false
        const dt = new Date(ts)
        return filteredMesSet.has(mesKey(dt))
      })
      .sort((a, b) => a - b)
    let acumDia = 0
    let prevProyAcum = 0
    const diario = allDiaKeys.map((ts) => {
      acumDia += realDia.get(ts)?.mods.size ?? 0
      prevProyAcum = Math.max(prevProyAcum, proyDia.get(ts)?.acum ?? 0)
      return {
        dia: realDia.get(ts)?.lbl ?? proyDia.get(ts)?.lbl ?? '',
        despachadoAcum: acumDia,
        proyectadoAcum: prevProyAcum,
      }
    })
    const gapDia = diario.length ? diario[diario.length - 1].despachadoAcum - diario[diario.length - 1].proyectadoAcum : 0

    // ── Tabla resumen mensual ──
    const curMesKey = mesKey(today)
    let acumReal = 0
    let acumPend = 0
    let prevAcumProy = 0
    const resumenMensual = filteredMesKeys.map((k) => {
      const rr = realMes.get(k)
      const pp = proyMes.get(k)
      const desp = rr?.mods.size ?? 0
      const acumProy = pp?.acum ?? 0
      acumReal += desp
      const isCurrentMes = k === curMesKey
      const mesAcumProy = isCurrentMes ? (pp?.acumHoy ?? 0) : acumProy
      const proyMesOnly = mesAcumProy - prevAcumProy
      prevAcumProy = mesAcumProy
      acumPend += proyMesOnly - desp
      return {
        mes: rr?.lbl ?? mesLbl(new Date(+k.split('_')[0], +k.split('_')[1] - 1, 1)),
        proyMesOnly, despachado: desp, acumProy, acumReal, pendiente: Math.max(0, acumPend),
      }
    })

    // ── Torre / tipo (no filtrado por mes) ──
    const torreTipoMap = new Map<string, Map<string, number>>()
    const tiposSet = new Set<string>()
    for (const x of d) {
      const torre = String(x.torre ?? '?')
      const tipo = String(x.tipo ?? '?')
      if (x.tipo) tiposSet.add(tipo)
      if (!torreTipoMap.has(torre)) torreTipoMap.set(torre, new Map())
      const m = torreTipoMap.get(torre)!
      m.set(tipo, (m.get(tipo) || 0) + 1)
    }
    const tipos = [...tiposSet]
    const torreTipo = [...torreTipoMap.keys()].map((torre) => {
      const row: Record<string, string | number> = { torre }
      for (const t of tipos) row[t] = torreTipoMap.get(torre)!.get(t) || 0
      return row
    })

    return {
      kpis, mensual, semanal, diario, gapDia, resumenMensual, torreTipo, tipos,
      mesesOpts, mesesSeleccionados, toggleMes,
    }
  }, [d, proy, excelData, allMesKeys, mesesSeleccionados, mesesOpts])
}

export type DespachosData = ReturnType<typeof useDespachosData>
