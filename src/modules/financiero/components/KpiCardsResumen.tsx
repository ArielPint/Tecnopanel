import { useMemo } from 'react'
import type { SeguimientoPresupuesto } from '@/modules/financiero/types/financiero'
import { formatCLP, formatPct } from '@/modules/financiero/utils/formatters'
import { Skeleton } from '@/modules/financiero/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface KpiCardsResumenProps {
  seguimiento: SeguimientoPresupuesto[]
  loading: boolean
}

type Tono = 'success' | 'warning' | 'destructive' | undefined

interface Kpi {
  label: string
  value: string
  sub?: string
  tono?: Tono
}

// Mismo umbral de 3 niveles que produccion.html/dashboard.html (pc(p) / pct>=100/75/50),
// invertido en dirección: acá "avance" alto es riesgo de sobrepaso, no una meta.
function tonoAvance(pct: number): Tono {
  if (pct >= 1) return 'destructive'
  if (pct >= 0.7) return 'warning'
  return 'success'
}

export default function KpiCardsResumen({ seguimiento, loading }: KpiCardsResumenProps) {
  const kpis = useMemo<Kpi[]>(() => {
    const totalPresupuesto = seguimiento.reduce((acc, r) => acc + r.presupuesto_original, 0)
    const totalFacturado = seguimiento.reduce((acc, r) => acc + r.facturado, 0)
    const pctGlobal = totalPresupuesto > 0 ? totalFacturado / totalPresupuesto : 0
    const sobrepasados = seguimiento.filter((r) => r.pct_avance >= 1).length

    return [
      { label: 'Presupuesto Total', value: formatCLP(totalPresupuesto), sub: `${seguimiento.length} partidas` },
      { label: 'Total Facturado', value: formatCLP(totalFacturado), sub: `${formatPct(pctGlobal)} del presupuesto`, tono: 'success' },
      { label: '% Avance Global', value: formatPct(pctGlobal), tono: tonoAvance(pctGlobal) },
      {
        label: 'Partidas Sobrepasadas',
        value: String(sobrepasados),
        sub: `de ${seguimiento.length} partidas`,
        tono: sobrepasados > 0 ? 'destructive' : 'success',
      },
    ]
  }, [seguimiento])

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="rounded-lg border bg-card p-4">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{kpi.label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p
              className={cn(
                'mt-1 text-2xl font-bold tabular-nums',
                kpi.tono === 'success' && 'text-success',
                kpi.tono === 'warning' && 'text-warning',
                kpi.tono === 'destructive' && 'text-destructive',
              )}
            >
              {kpi.value}
            </p>
          )}
          {!loading && kpi.sub && <p className="mt-0.5 text-xs text-muted-foreground">{kpi.sub}</p>}
        </div>
      ))}
    </div>
  )
}
