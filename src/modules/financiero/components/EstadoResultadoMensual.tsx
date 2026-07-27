import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, TrendingUp } from 'lucide-react'
import type { EstadoResultadoDetallePartida, EstadoResultadoMensual } from '@/modules/financiero/types/financiero'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import { Button } from '@/modules/financiero/components/ui/button'
import { formatCLP, formatPct, nombreMes } from '@/modules/financiero/utils/formatters'
import { cn } from '@/lib/utils'

interface EstadoResultadoMensualProps {
  estadoResultado: EstadoResultadoMensual[]
  detalle: EstadoResultadoDetallePartida[]
  loading: boolean
  error: string | null
}

type CampoNumerico = Exclude<keyof EstadoResultadoMensual, 'anio' | 'mes'>

interface FilaMetrica {
  campo: CampoNumerico
  label: string
  esPct?: boolean
  esSubtotal?: boolean
  esResultado?: boolean
  categoria?: string
}

const FILAS: FilaMetrica[] = [
  { campo: 'materiales', label: 'Materiales', categoria: 'materiales' },
  { campo: 'pct_avance_materiales_fabrica', label: '% Avance Materiales Fabrica', esPct: true },
  { campo: 'mano_obra', label: 'Mano de Obra', categoria: 'mano_obra' },
  { campo: 'gastos_operacionales', label: 'Gastos Operacionales', categoria: 'gastos_operacionales' },
  { campo: 'fletes', label: 'Fletes' },
  { campo: 'subtotal_costos_directos', label: 'Subtotal Costos Directos', esSubtotal: true },
  { campo: 'gastos_generales', label: 'Gastos Generales', categoria: 'gastos_generales' },
  { campo: 'gastos_activados', label: 'Gastos Activados 2025' },
  { campo: 'costos', label: 'Total Costos', esSubtotal: true },
  { campo: 'ingresos', label: 'Ingresos' },
  { campo: 'margen', label: 'Margen', esResultado: true },
  { campo: 'ebitda', label: 'EBITDA', esResultado: true },
  { campo: 'margen_proforma', label: 'Margen Proforma', esResultado: true },
  { campo: 'ebitda_proforma', label: 'EBITDA Proforma', esResultado: true },
]

export default function EstadoResultadoMensualView({ estadoResultado, detalle, loading, error }: EstadoResultadoMensualProps) {
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())

  const partidasPorCategoria = useMemo(() => {
    const mapa = new Map<string, Map<string, { nombre: string; porMes: Map<string, number> }>>()
    for (const d of detalle) {
      if (!mapa.has(d.categoria)) mapa.set(d.categoria, new Map())
      const partidas = mapa.get(d.categoria)!
      if (!partidas.has(d.codigo_articulo)) partidas.set(d.codigo_articulo, { nombre: d.nombre, porMes: new Map() })
      partidas.get(d.codigo_articulo)!.porMes.set(`${d.anio}-${d.mes}`, d.monto)
    }
    return mapa
  }, [detalle])

  if (error) return <p className="text-destructive">{error}</p>

  if (!loading && estadoResultado.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Todavía no hay datos para el estado de resultado"
        description="Aparece acá apenas haya OC, remuneraciones o ingresos cargados con mes y año."
      />
    )
  }

  const toggle = (categoria: string) => {
    setExpandidas((prev) => {
      const next = new Set(prev)
      if (next.has(categoria)) next.delete(categoria)
      else next.add(categoria)
      return next
    })
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Categoría</TableHead>
            {estadoResultado.map((r) => (
              <TableHead key={`${r.anio}-${r.mes}`} className="text-right whitespace-nowrap">
                {nombreMes(r.mes).slice(0, 3)} {r.anio}
              </TableHead>
            ))}
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        {loading ? (
          <TableSkeleton columns={estadoResultado.length + 2} rows={FILAS.length} />
        ) : (
          <TableBody>
            {FILAS.map((fila) => {
              const total = fila.esPct ? null : estadoResultado.reduce((acc, r) => acc + r[fila.campo], 0)
              const partidas = fila.categoria ? partidasPorCategoria.get(fila.categoria) : undefined
              const abierta = !!fila.categoria && expandidas.has(fila.categoria)
              return (
                <Fragment key={fila.campo}>
                  <TableRow>
                    <TableCell className={cn('font-medium', fila.esSubtotal && 'font-semibold')}>
                      {partidas && partidas.size > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-2 h-6 gap-1 px-2 font-medium"
                          onClick={() => toggle(fila.categoria!)}
                        >
                          {abierta ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                          {fila.label}
                        </Button>
                      ) : (
                        fila.label
                      )}
                    </TableCell>
                    {estadoResultado.map((r) => {
                      const valor = r[fila.campo]
                      return (
                        <TableCell
                          key={`${r.anio}-${r.mes}`}
                          className={cn(
                            'text-right tabular-nums',
                            fila.esSubtotal && 'font-semibold',
                            fila.esResultado && cn('font-semibold', valor < 0 ? 'text-destructive' : 'text-success'),
                          )}
                        >
                          {fila.esPct ? formatPct(valor) : formatCLP(valor)}
                        </TableCell>
                      )
                    })}
                    <TableCell
                      className={cn(
                        'text-right font-semibold tabular-nums',
                        fila.esResultado && total !== null && (total < 0 ? 'text-destructive' : 'text-success'),
                      )}
                    >
                      {total === null ? '—' : formatCLP(total)}
                    </TableCell>
                  </TableRow>
                  {abierta &&
                    partidas &&
                    Array.from(partidas.entries()).map(([codigo, p]) => {
                      const totalPartida = Array.from(p.porMes.values()).reduce((acc, v) => acc + v, 0)
                      return (
                        <TableRow key={`${fila.campo}-${codigo}`} className="bg-muted/30">
                          <TableCell className="pl-8 text-xs text-muted-foreground">
                            {codigo} — {p.nombre}
                          </TableCell>
                          {estadoResultado.map((r) => (
                            <TableCell key={`${r.anio}-${r.mes}`} className="text-right text-xs tabular-nums text-muted-foreground">
                              {formatCLP(p.porMes.get(`${r.anio}-${r.mes}`) ?? 0)}
                            </TableCell>
                          ))}
                          <TableCell className="text-right text-xs font-medium tabular-nums text-muted-foreground">
                            {formatCLP(totalPartida)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                </Fragment>
              )
            })}
          </TableBody>
        )}
      </Table>
    </div>
  )
}
