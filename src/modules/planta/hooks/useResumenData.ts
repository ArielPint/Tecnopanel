import { useEffect, useMemo, useState } from 'react'
import { MESES_ORDER, parseDate } from '../lib/format'
import type { DetalleGdRow, ParsedDashboardData } from '../lib/excelParser'
import {
  loadAvanceEconProy,
  loadCompras,
  loadModulosDespachadosCount,
  loadPptoCatalogo,
  loadPresupuestoTotal,
  type AvanceEconProyRow,
} from '../lib/supaData'

const MES_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const MES_ABBR: Record<string, string> = {
  Enero: 'Ene', Febrero: 'Feb', Marzo: 'Mar', Abril: 'Abr', Mayo: 'May', Junio: 'Jun',
  Julio: 'Jul', Agosto: 'Ago', Septiembre: 'Sep', Octubre: 'Oct', Noviembre: 'Nov', Diciembre: 'Dic',
}

export function getCompras(supaCompras: DetalleGdRow[], excelDetalleGD: DetalleGdRow[], pptoCatalogo: Record<string, number>) {
  const base = supaCompras.length ? supaCompras : excelDetalleGD
  if (!Object.keys(pptoCatalogo).length) return base
  return base.map((row) => {
    const livePpto = pptoCatalogo[String(row.codigo ?? '').trim().toUpperCase()]
    if (livePpto == null) return row
    const totalPpto = (row.cantRec ?? 0) * livePpto
    const difTotal = totalPpto - (row.valorTotal ?? 0)
    return { ...row, valorPpto: livePpto, totalPpto, difTotal, difPct: totalPpto ? difTotal / totalPpto : null }
  })
}

export function getHomeAvance(
  compras: DetalleGdRow[],
  avanceProy: AvanceEconProyRow[],
  presupuestoTotal: number | null,
  excelFallback: ParsedDashboardData['homeAvance'],
) {
  if (!avanceProy.length) return excelFallback
  const anio = new Date().getFullYear()
  const ppto = presupuestoTotal || 1
  const montoMes: Record<string, number> = {}
  for (const c of compras) {
    const key = `${c.anioGuia ?? anio}-${c.mes}`
    montoMes[key] = (montoMes[key] || 0) + (c.valorTotal ?? 0)
  }
  const preAnio = Object.entries(montoMes)
    .filter(([k]) => parseInt(k.split('-')[0]) < anio)
    .reduce((s, [, v]) => s + v, 0)
  const proyMap: Record<number, number> = {}
  for (const r of avanceProy) proyMap[r.mes] = parseFloat(String(r.valor)) || 0

  return MES_NAMES.map((nombre, i) => {
    const mes = i + 1
    let real = montoMes[`${anio}-${mes}`] || 0
    if (mes === 1) real += preAnio
    return { mes: nombre, avEcon: ppto > 0 ? real / ppto : null, avEconProy: proyMap[mes] ?? null }
  })
}

export function useResumenData(excelData: ParsedDashboardData | null) {
  const [loadingSupa, setLoadingSupa] = useState(true)
  const [supaCompras, setSupaCompras] = useState<DetalleGdRow[]>([])
  const [presupuestoTotal, setPresupuestoTotal] = useState<number | null>(null)
  const [pptoCatalogo, setPptoCatalogo] = useState<Record<string, number>>({})
  const [despachadosCount, setDespachadosCount] = useState(0)
  const [avanceProy, setAvanceProy] = useState<AvanceEconProyRow[]>([])

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      const [compras, ppto, catalogo, despachados, proy] = await Promise.all([
        loadCompras(),
        loadPresupuestoTotal(),
        loadPptoCatalogo(),
        loadModulosDespachadosCount(),
        loadAvanceEconProy(new Date().getFullYear()),
      ])
      if (cancelado) return
      setSupaCompras(compras)
      setPresupuestoTotal(ppto)
      setPptoCatalogo(catalogo)
      setDespachadosCount(despachados)
      setAvanceProy(proy)
      setLoadingSupa(false)
    }
    cargar()
    return () => {
      cancelado = true
    }
  }, [])

  return useMemo(() => {
    const modulos = excelData?.modulos ?? []
    const curva = excelData?.curva ?? []
    const totalMod = modulos.length
    const terminados = modulos.filter((m) => m.termReal).length
    const enProceso = modulos.filter((m) => m.initReal && !m.termReal).length
    const avProm = totalMod ? modulos.reduce((s, m) => s + (m.avance ?? 0), 0) / totalMod : 0

    const hoy = new Date()
    hoy.setHours(23, 59, 59, 999)
    const curvaHoy = curva.filter((c) => {
      const d = parseDate(c.fecha)
      return d && !isNaN(d.getTime()) && d <= hoy
    })
    const lastReal = [...curvaHoy].reverse().find((c) => c.real != null && c.real > 0)
    const avanceFisico = lastReal ? (lastReal.real ?? 0) * 100 : avProm * 100

    const compras = getCompras(supaCompras, excelData?.detalleGD ?? [], pptoCatalogo)
    const totalComprado = compras.reduce((s, c) => s + (c.valorTotal ?? 0), 0)
    const presupuesto = presupuestoTotal ?? compras.find((c) => c.presupuesto)?.presupuesto ?? null

    const kpis = {
      ejecucionPpto: presupuesto ? (totalComprado / presupuesto) * 100 : null,
      ejecucionSobrePresupuesto: !!(presupuesto && totalComprado > presupuesto),
      avanceFisico,
      totalComprado,
      modulosTerminados: terminados,
      pctTerminados: totalMod ? (terminados / totalMod) * 100 : null,
      modulosEnProceso: enProceso,
      modulosDespachados: despachadosCount,
      pctDespachados: totalMod ? (despachadosCount / totalMod) * 100 : null,
      totalModulos: totalMod,
    }

    // Distribución 10% buckets — solo >=50%, excluye completados y despachados (mismo criterio que dashboard.html)
    const bucketDefs = ['50–59%', '60–69%', '70–79%', '80–89%', '90–99%']
    const buckets: Record<string, number> = {}
    for (const b of bucketDefs) buckets[b] = 0
    for (const m of modulos) {
      if (m.termReal) continue
      const p = (m.avance ?? 0) * 100
      if (p >= 100) continue
      if (p >= 90) buckets['90–99%']++
      else if (p >= 80) buckets['80–89%']++
      else if (p >= 70) buckets['70–79%']++
      else if (p >= 60) buckets['60–69%']++
      else if (p >= 50) buckets['50–59%']++
    }
    const distribucionBuckets = bucketDefs.map((b) => ({ bucket: b, cantidad: buckets[b] }))

    // Compras reales vs presupuesto por mes
    const mesReal: Record<string, number> = {}
    const mesPpto: Record<string, number> = {}
    for (const c of compras) {
      const key = `${c.mes}-${c.anioGuia}`
      mesReal[key] = (mesReal[key] || 0) + (c.valorTotal ?? 0)
      mesPpto[key] = (mesPpto[key] || 0) + (c.totalPpto ?? 0)
    }
    const mesesConDatos = MESES_ORDER.filter((m) => mesReal[`${m.n}-${m.y}`] || mesPpto[`${m.n}-${m.y}`])
    const comprasVsPresupuesto = mesesConDatos.map((m) => {
      const real = mesReal[`${m.n}-${m.y}`] || 0
      const ppto = mesPpto[`${m.n}-${m.y}`] || 0
      return { mes: m.lbl, real: Math.round(real), presupuesto: Math.round(ppto), sobrepasado: ppto > 0 && real > ppto }
    })

    // Crecimiento mensual de compras (tabla) — desde Mar 2026
    const CREC_DESDE = { n: 3, y: 2026 }
    let acum = 0
    let montoMesAnterior: number | null = null
    const crecimientoMensual = mesesConDatos.map((m) => {
      const montoMes = mesReal[`${m.n}-${m.y}`] || 0
      acum += montoMes
      const desdeInicio = m.y > CREC_DESDE.y || (m.y === CREC_DESDE.y && m.n >= CREC_DESDE.n)
      const esPrimerMes = m.y === CREC_DESDE.y && m.n === CREC_DESDE.n
      const crecimiento =
        desdeInicio && !esPrimerMes && montoMesAnterior != null && montoMesAnterior > 0
          ? ((montoMes - montoMesAnterior) / montoMesAnterior) * 100
          : null
      montoMesAnterior = montoMes
      return { mes: m.lbl, montoMes, acum, crecimiento }
    })

    // Avance económico mensual/acumulado
    const ha = getHomeAvance(compras, avanceProy, presupuestoTotal, excelData?.homeAvance ?? [])
    const curMes = new Date().getMonth() + 1
    const haFilt = ha.filter((x) => {
      const idx = MES_NAMES.indexOf(String(x.mes))
      return (idx < 0 ? 13 : idx + 1) <= curMes
    })
    const avanceEconomico = haFilt.map((x) => ({
      mes: MES_ABBR[String(x.mes)] ?? String(x.mes).slice(0, 3),
      real: x.avEcon != null ? +(x.avEcon * 100).toFixed(2) : null,
      proyectado: x.avEconProy != null ? +(x.avEconProy * 100).toFixed(2) : null,
    }))
    let sumReal = 0
    let sumProy = 0
    const avanceEconomicoAcumulado = avanceEconomico.map((x) => {
      if (x.real != null) sumReal += x.real
      if (x.proyectado != null) sumProy += x.proyectado
      return {
        mes: x.mes,
        realAcum: x.real != null ? +sumReal.toFixed(2) : null,
        proyAcum: x.proyectado != null ? +sumProy.toFixed(2) : null,
      }
    })

    // M² acumulado real vs programado por mes
    const m2ByMes: Record<string, { plan: number; real: number; lastPlan: Date | null; lastReal: Date | null }> = {}
    for (const r of curva) {
      const fd = parseDate(r.fecha)
      if (!fd || isNaN(fd.getTime())) continue
      const key = `${fd.getMonth() + 1}-${fd.getFullYear()}`
      if (!m2ByMes[key]) m2ByMes[key] = { plan: 0, real: 0, lastPlan: null, lastReal: null }
      const entry = m2ByMes[key]
      if (!entry.lastPlan || fd > entry.lastPlan) {
        entry.plan = r.m2PlanAcum || 0
        entry.lastPlan = fd
      }
      if (fd <= hoy && (!entry.lastReal || fd > entry.lastReal)) {
        entry.real = r.m2RealAcum || 0
        entry.lastReal = fd
      }
    }
    const m2Acumulado = MESES_ORDER.filter((m) => m2ByMes[`${m.n}-${m.y}`]).map((m) => {
      const e = m2ByMes[`${m.n}-${m.y}`]
      return { mes: m.lbl, real: e.real, plan: e.plan }
    })

    return {
      loading: loadingSupa && !excelData,
      kpis,
      distribucionBuckets,
      comprasVsPresupuesto,
      crecimientoMensual,
      avanceEconomico,
      avanceEconomicoAcumulado,
      m2Acumulado,
    }
  }, [excelData, supaCompras, presupuestoTotal, pptoCatalogo, despachadosCount, avanceProy, loadingSupa])
}

export type ResumenData = ReturnType<typeof useResumenData>
