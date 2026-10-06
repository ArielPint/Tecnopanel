import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { hoyChile, inicioSemana, sumarDias } from '../lib/formato'

export const selectClase =
  'flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60'

export function Tile({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <p className="mt-1 font-mono-tabular text-2xl font-extrabold">{valor}</p>
        {detalle && <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>}
      </CardContent>
    </Card>
  )
}

export function Encabezado({ titulo, descripcion, children }: { titulo: string; descripcion: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-xl font-extrabold">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{descripcion}</p>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

export type Preset = 'hoy' | 'ayer' | 'semana' | 'mes' | 'mes_anterior' | '30d' | 'rango'

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: 'mes_anterior', label: 'Mes anterior' },
  { key: '30d', label: 'Últimos 30 días' },
  { key: 'rango', label: 'Entre fechas…' },
]

function rangoDe(p: Preset): { desde: string; hasta: string } {
  const hoy = hoyChile()
  switch (p) {
    case 'hoy':
      return { desde: hoy, hasta: hoy }
    case 'ayer':
      return { desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1) }
    case 'semana':
      return { desde: inicioSemana(hoy), hasta: hoy }
    case 'mes_anterior': {
      const inicioMes = `${hoy.slice(0, 7)}-01`
      const fin = sumarDias(inicioMes, -1)
      return { desde: `${fin.slice(0, 7)}-01`, hasta: fin }
    }
    case '30d':
      return { desde: sumarDias(hoy, -29), hasta: hoy }
    default:
      return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy }
  }
}

/** Período elegido con atajos o entre dos fechas. */
export function usePeriodo(inicial: Preset = 'mes') {
  const [preset, setPreset] = useState<Preset>(inicial)
  const [rango, setRango] = useState(() => rangoDe(inicial))
  const efectivo = useMemo(() => (preset === 'rango' ? rango : rangoDe(preset)), [preset, rango])
  return {
    preset,
    desde: efectivo.desde,
    hasta: efectivo.hasta,
    setPreset: (p: Preset) => {
      if (p === 'rango') setRango(rangoDe(preset)) // parte desde lo que se estaba viendo
      setPreset(p)
    },
    setRango,
    rango,
  }
}

export function SelectorPeriodo({ periodo }: { periodo: ReturnType<typeof usePeriodo> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={periodo.preset}
        onChange={(e) => periodo.setPreset(e.target.value as Preset)}
        className={`${selectClase} w-auto min-w-[160px]`}
        aria-label="Período"
      >
        {PRESETS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
      {periodo.preset === 'rango' && (
        <>
          <Input
            type="date"
            value={periodo.rango.desde}
            max={periodo.rango.hasta}
            onChange={(e) => e.target.value && periodo.setRango((r) => ({ ...r, desde: e.target.value }))}
            className="w-auto"
            aria-label="Desde"
          />
          <span className="text-sm text-muted-foreground">a</span>
          <Input
            type="date"
            value={periodo.rango.hasta}
            min={periodo.rango.desde}
            onChange={(e) => e.target.value && periodo.setRango((r) => ({ ...r, hasta: e.target.value }))}
            className="w-auto"
            aria-label="Hasta"
          />
        </>
      )}
    </div>
  )
}

export function Cargando() {
  return <div className="h-24 animate-pulse rounded bg-muted" />
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
}
