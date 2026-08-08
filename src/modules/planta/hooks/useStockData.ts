import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import type { ParsedDashboardData } from '../lib/excelParser'
import { parseDate, weekKey, weekLabel } from '../lib/format'
import { loadRegistroStock, type RegistroStockRow } from '../lib/supaData'

export interface StockRow {
  fecha: string
  codigo: string
  material: string
  desc: string
  stockFisico: number
  consumo: number | null
  consumoMod: number | null
  critico: unknown
  alcanceMod: number | null
  consumoEquivMod: number | null
  perdida: number | null
  perdidaEquivMod: number | null
  valorUN: number | null
  valorStock: number | null
  valorPerdida: number | null
  consumoValorizado: number | null
  semanaKey: string
  weekTs: number | null
}

function enriquecer(rows: RegistroStockRow[], excelData: ParsedDashboardData | null): StockRow[] {
  const prodMap: Record<string, ParsedDashboardData['productos'][number]> = {}
  for (const p of excelData?.productos ?? []) {
    if (p.codigo) prodMap[String(p.codigo).trim().toUpperCase()] = p
  }
  const modulos = excelData?.modulos ?? []
  const modIniciados = modulos.filter((m) => m.initReal).length

  return rows.map((row) => {
    const k = String(row.codigo).trim().toUpperCase()
    const prod = prodMap[k]
    const sf = +(row.stock_fisico || 0)
    const consumoMod = prod?.cantMod ?? null
    const valorUN = prod?.precioUN ?? prod?.precioCompra ?? null
    const recibido = prod?.cantRec ?? null
    const consumo = recibido != null ? Math.max(0, +(recibido - sf).toFixed(4)) : null
    const alcanceMod = consumoMod && consumoMod > 0 ? +(sf / consumoMod).toFixed(4) : null
    const consumoEquivMod = consumoMod && consumoMod > 0 && consumo != null ? +(consumo / consumoMod).toFixed(4) : null
    const consumoTeorico = consumoMod != null ? modIniciados * consumoMod : null
    const perdida = consumo != null && consumoTeorico != null ? +(consumo - consumoTeorico).toFixed(4) : null
    const perdidaEquivMod = consumoMod && consumoMod > 0 && perdida != null ? +(perdida / consumoMod).toFixed(4) : null
    const valorStock = valorUN != null ? +(sf * valorUN).toFixed(2) : null
    const consumoValorizado = valorUN != null && consumo != null ? +(consumo * valorUN).toFixed(2) : null
    const valorPerdida = valorUN != null && perdida != null ? +(perdida * valorUN).toFixed(2) : null
    const d = parseDate(row.fecha)

    return {
      fecha: row.fecha, codigo: row.codigo, material: row.material,
      desc: String(prod?.desc ?? row.material), stockFisico: sf,
      consumo, consumoMod, critico: prod?.critico ?? null,
      alcanceMod, consumoEquivMod, perdida, perdidaEquivMod, valorUN,
      valorStock, valorPerdida, consumoValorizado,
      semanaKey: row.semana_key, weekTs: d ? weekKey(d) : null,
    }
  })
}

export function useStockData(excelData: ParsedDashboardData | null) {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [selectedWeekTs, setSelectedWeekTs] = useState<number | null>(null)

  const fetcher = useCallback(async () => {
    const proyectoId = await getProyectoId(proyectoSlug!)
    return loadRegistroStock(proyectoId)
  }, [proyectoSlug])

  const { data } = useCachedQuery<RegistroStockRow[]>(proyectoSlug ? `registro_stock:${proyectoSlug}` : null, fetcher, 60_000)
  const rows = data ?? []

  const enriquecidas = useMemo(() => enriquecer(rows, excelData), [rows, excelData])

  const semanas = useMemo(() => {
    const seen = new Set<number>()
    for (const r of enriquecidas) if (r.weekTs != null) seen.add(r.weekTs)
    return [...seen].sort((a, b) => a - b).map((ts) => ({ ts, lbl: 'Semana ' + weekLabel(ts) }))
  }, [enriquecidas])

  useEffect(() => {
    if (selectedWeekTs == null && semanas.length) setSelectedWeekTs(semanas[semanas.length - 1].ts)
  }, [semanas, selectedWeekTs])

  const semanaIdx = semanas.findIndex((s) => s.ts === selectedWeekTs)
  const goPrev = () => semanaIdx > 0 && setSelectedWeekTs(semanas[semanaIdx - 1].ts)
  const goNext = () => semanaIdx >= 0 && semanaIdx < semanas.length - 1 && setSelectedWeekTs(semanas[semanaIdx + 1].ts)
  const goLast = () => semanas.length && setSelectedWeekTs(semanas[semanas.length - 1].ts)

  const stockData = useMemo(
    () => (selectedWeekTs != null ? enriquecidas.filter((r) => r.weekTs === selectedWeekTs) : enriquecidas),
    [enriquecidas, selectedWeekTs],
  )

  const modConstruidos = useMemo(() => {
    const vals = (excelData?.modulos ?? []).filter((m) => m.termReal).length
    return vals || null
  }, [excelData])

  const kpis = useMemo(() => {
    const totalValor = stockData.reduce((a, x) => a + (x.valorStock ?? 0), 0)
    const totalPerdida = stockData.reduce((a, x) => a + (x.valorPerdida ?? 0), 0)
    const criticos = stockData.filter((x) => (x.alcanceMod ?? 0) < 5).length
    return { materiales: stockData.length, totalValor, criticos, modConstruidos, totalPerdida }
  }, [stockData, modConstruidos])

  const comparacion = useMemo(() => {
    const prevIdx = semanaIdx > 0 ? semanaIdx - 1 : -1
    const prevTs = prevIdx >= 0 ? semanas[prevIdx].ts : null
    const prevMap: Record<string, number> = {}
    if (prevTs != null) {
      for (const r of enriquecidas) if (r.weekTs === prevTs) prevMap[r.codigo.trim().toUpperCase()] = r.stockFisico
    }
    return [...stockData]
      .map((x) => ({ x, prev: prevMap[x.codigo.trim().toUpperCase()] ?? null }))
      .sort((a, b) => Math.abs((b.x.stockFisico || 0) - (b.prev || 0)) - Math.abs((a.x.stockFisico || 0) - (a.prev || 0)))
      .slice(0, 20)
      .map((r) => ({
        material: String(r.x.desc || r.x.material || '').substring(0, 18),
        anterior: r.prev != null ? +r.prev.toFixed(2) : 0,
        actual: +(r.x.stockFisico || 0).toFixed(2),
      }))
  }, [stockData, enriquecidas, semanaIdx, semanas])

  const perdidas = useMemo(
    () => stockData.filter((x) => (x.valorPerdida ?? 0) > 0).sort((a, b) => (b.valorPerdida ?? 0) - (a.valorPerdida ?? 0)),
    [stockData],
  )

  const semanaActual = semanaIdx >= 0 ? semanas[semanaIdx] : null

  return { semanas, selectedWeekTs, setSelectedWeekTs, semanaActual, goPrev, goNext, goLast, kpis, comparacion, perdidas, stockData }
}

export type StockData = ReturnType<typeof useStockData>
