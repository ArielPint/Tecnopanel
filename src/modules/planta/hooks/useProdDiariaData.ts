import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getProyectoId } from '@/lib/proyectoIds'
import { loadPlantaModulosProdDiaria, type PlantaModuloProdRow } from '../lib/supaData'

export const PD_CATS = {
  obra_gruesa: { label: 'Obra Gruesa', color: '#4f8ef7', codes: ['OG.01', 'OG.02', 'OG.03', 'OG.04', 'OG.05'] },
  sanitario: { label: 'Sanitario', color: '#3fcf8e', codes: ['SA.01', 'SA.02', 'SA.03', 'SA.04', 'SA.05'] },
  electrico: { label: 'Eléctrico', color: '#f7d74f', codes: ['EL.01', 'EL.02', 'EL.03', 'EL.04', 'EL.05'] },
  terminaciones: {
    label: 'Terminaciones', color: '#bc8cff',
    codes: ['TE.01', 'TE.02', 'TE.03', 'TE.04', 'TE.05', 'TE.06', 'TE.07', 'TE.08', 'TE.09', 'TE.10',
      'TE.11', 'TE.12', 'TE.13', 'TE.14', 'TE.15', 'TE.16', 'TE.17', 'TE.18', 'TE.19', 'TE.20', 'TE.21', 'TE.22'],
  },
} as const
type Cat = keyof typeof PD_CATS
const CAT_KEYS = Object.keys(PD_CATS) as Cat[]

function estadoDe(s: unknown): string | undefined {
  if (!s) return undefined
  return typeof s === 'object' ? (s as { c3?: string }).c3 : (s as string)
}
const isNA = (s: unknown) => estadoDe(s) === 'no_aplica'
const isDone = (s: unknown) => estadoDe(s) === 'aprobado'

interface Row {
  date: string
  cat: Cat
}

function computeRows(mods: PlantaModuloProdRow[]): Row[] {
  const rows: Row[] = []
  for (const m of mods) {
    const est = m.estados ?? {}
    const tim = m.tiempos ?? {}
    for (const cat of CAT_KEYS) {
      const codes = PD_CATS[cat].codes as readonly string[]
      const rel = codes.filter((c) => !isNA(est[c]))
      if (!rel.length) continue
      if (!rel.every((c) => isDone(est[c]))) continue
      let maxD: string | null = null
      for (const c of rel) {
        const t = tim[c]
        if (t?.t3) {
          const d = t.t3.slice(0, 10)
          if (!maxD || d > maxD) maxD = d
        }
      }
      if (maxD) rows.push({ date: maxD, cat })
    }
  }
  return rows
}

function todayISO(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

export function useProdDiariaData() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [mods, setMods] = useState<PlantaModuloProdRow[]>([])
  const [desde, setDesde] = useState(() => todayISO(-30))
  const [hasta, setHasta] = useState(() => todayISO())

  useEffect(() => {
    let cancelado = false
    getProyectoId(proyectoSlug!).then((proyectoId) =>
      loadPlantaModulosProdDiaria(proyectoId).then((r) => {
        if (!cancelado) setMods(r)
      }),
    )
    return () => {
      cancelado = true
    }
  }, [proyectoSlug])

  return useMemo(() => {
    let rows = computeRows(mods)
    if (desde) rows = rows.filter((r) => r.date >= desde)
    if (hasta) rows = rows.filter((r) => r.date <= hasta)

    const dateSet = [...new Set(rows.map((r) => r.date))].sort()
    const byDate: Record<string, Record<Cat, number>> = {}
    for (const d of dateSet) {
      byDate[d] = { obra_gruesa: 0, sanitario: 0, electrico: 0, terminaciones: 0 }
    }
    for (const r of rows) byDate[r.date][r.cat]++

    const kpis = CAT_KEYS.map((c) => ({ cat: c, label: PD_CATS[c].label, total: rows.filter((r) => r.cat === c).length }))
    const totalPeriodo = rows.length

    const chartData = dateSet.map((d) => {
      const [, mo, dy] = d.split('-')
      return { fecha: `${dy}/${mo}`, ...byDate[d] }
    })

    const tabla = dateSet.map((d) => ({
      fecha: d.split('-').reverse().join('/'),
      ...byDate[d],
      total: CAT_KEYS.reduce((s, c) => s + byDate[d][c], 0),
    }))

    return { desde, setDesde, hasta, setHasta, kpis, totalPeriodo, chartData, tabla, catKeys: CAT_KEYS, cats: PD_CATS }
  }, [mods, desde, hasta])
}

export type ProdDiariaData = ReturnType<typeof useProdDiariaData>
