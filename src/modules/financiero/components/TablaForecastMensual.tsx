import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { usePresupuestos } from '@/modules/financiero/hooks/usePresupuestos'
import { useForecast } from '@/modules/financiero/hooks/useForecast'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { formatCLP, formatPct, nombreMes } from '@/modules/financiero/utils/formatters'

interface FacturadoPorMes {
  [key: string]: number // "mes-anio" -> total
}

// Mismo mapeo tarea_wip -> categoría que financiero_seguimiento_presupuesto
// (migración 021): 20010 junta operaciones+administrativos, 30124 es adm_ventas.
function categoriasRemuneracion(tareaWip: string | null): string[] | null {
  if (tareaWip === '20010') return ['operaciones', 'administrativos']
  if (tareaWip === '30124') return ['adm_ventas']
  return null
}

export default function TablaForecastMensual() {
  const { presupuestos, loading: loadingPresupuestos } = usePresupuestos()
  const [presupuestoId, setPresupuestoId] = useState<string>('')
  const { forecast, loading: loadingForecast } = useForecast(presupuestoId || undefined)
  const [facturadoPorMes, setFacturadoPorMes] = useState<FacturadoPorMes>({})
  const [remuneracionesPorMes, setRemuneracionesPorMes] = useState<FacturadoPorMes>({})
  const [gastosDirectosPorMes, setGastosDirectosPorMes] = useState<FacturadoPorMes>({})

  useEffect(() => {
    if (!presupuestoId) return
    supabase
      .from('financiero_facturas')
      .select('mes, anio, monto')
      .eq('presupuesto_id', presupuestoId)
      .neq('estado', 'ANULADA')
      .then(({ data }) => {
        const totales: FacturadoPorMes = {}
        for (const fila of data ?? []) {
          const key = `${fila.mes}-${fila.anio}`
          totales[key] = (totales[key] ?? 0) + Number(fila.monto)
        }
        setFacturadoPorMes(totales)
      })
  }, [presupuestoId])

  useEffect(() => {
    if (!presupuestoId && presupuestos.length > 0) setPresupuestoId(presupuestos[0].id)
  }, [presupuestos, presupuestoId])

  const presupuesto = presupuestos.find((p) => p.id === presupuestoId)

  useEffect(() => {
    const categorias = categoriasRemuneracion(presupuesto?.tarea_wip ?? null)
    if (!categorias) {
      setRemuneracionesPorMes({})
      return
    }
    supabase
      .from('financiero_remuneraciones')
      .select('mes, anio, monto, categoria')
      .in('categoria', categorias)
      .then(({ data }) => {
        const totales: FacturadoPorMes = {}
        for (const fila of data ?? []) {
          const key = `${fila.mes}-${fila.anio}`
          totales[key] = (totales[key] ?? 0) + Number(fila.monto)
        }
        setRemuneracionesPorMes(totales)
      })
  }, [presupuesto?.tarea_wip])

  useEffect(() => {
    if (!presupuestoId) {
      setGastosDirectosPorMes({})
      return
    }
    supabase
      .from('financiero_gastos_directos')
      .select('mes, anio, monto')
      .eq('presupuesto_id', presupuestoId)
      .then(({ data }) => {
        const totales: FacturadoPorMes = {}
        for (const fila of data ?? []) {
          const key = `${fila.mes}-${fila.anio}`
          totales[key] = (totales[key] ?? 0) + Number(fila.monto)
        }
        setGastosDirectosPorMes(totales)
      })
  }, [presupuestoId])

  // "Facturado" = facturas + remuneraciones asociadas al tarea_wip + gastos
  // directos cargados para este presupuesto, igual que "Costo Total" en la
  // tabla de detalle (financiero_seguimiento_presupuesto).
  const costoPorMes = useMemo(() => {
    const totales: FacturadoPorMes = { ...facturadoPorMes }
    for (const [key, monto] of Object.entries(remuneracionesPorMes)) {
      totales[key] = (totales[key] ?? 0) + monto
    }
    for (const [key, monto] of Object.entries(gastosDirectosPorMes)) {
      totales[key] = (totales[key] ?? 0) + monto
    }
    return totales
  }, [facturadoPorMes, remuneracionesPorMes, gastosDirectosPorMes])

  // Unión de meses con forecast cargado Y meses con costo real: si solo se
  // itera `forecast`, los meses sin fila de forecast (ej. sin cobertura para
  // ese período, o remuneraciones sin forecast asociado) quedan invisibles
  // aunque sí tengan costo — y el Total terminaba sin coincidir con la suma
  // visible fila por fila.
  const periodos = useMemo(() => {
    const mapa = new Map<string, { mes: number; anio: number; montoForecast: number | null }>()
    for (const f of forecast) {
      mapa.set(`${f.mes}-${f.anio}`, { mes: f.mes, anio: f.anio, montoForecast: f.monto_forecast })
    }
    for (const key of Object.keys(costoPorMes)) {
      if (!mapa.has(key)) {
        const [mes, anio] = key.split('-').map(Number)
        mapa.set(key, { mes, anio, montoForecast: null })
      }
    }
    return Array.from(mapa.values()).sort((a, b) => a.anio - b.anio || a.mes - b.mes)
  }, [forecast, costoPorMes])

  // El forecast es una foto del presupuesto actualizado, no algo que se sume
  // mes a mes: el total es el último valor cargado (o el presupuesto original
  // si nunca se actualizó), igual que forecast_actual en la migración 022.
  const ultimoForecast = [...forecast]
    .filter((f) => f.monto_forecast != null)
    .sort((a, b) => b.anio - a.anio || b.mes - a.mes)[0]?.monto_forecast
  const totalForecast = ultimoForecast ?? presupuesto?.presupuesto_original ?? 0
  const totalCostoTotal = Object.values(costoPorMes).reduce((acc, v) => acc + v, 0)
  const totalFacturado = Object.values(facturadoPorMes).reduce((acc, v) => acc + v, 0)

  return (
    <div className="space-y-4">
      <Select value={presupuestoId} onValueChange={setPresupuestoId} disabled={loadingPresupuestos}>
        <SelectTrigger className="w-full sm:w-80">
          <SelectValue placeholder="Elegí un presupuesto" />
        </SelectTrigger>
        <SelectContent>
          {presupuestos.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loadingForecast ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mes</TableHead>
              <TableHead className="text-right">Presupuesto</TableHead>
              <TableHead className="text-right">Forecast</TableHead>
              <TableHead className="text-right">Facturado</TableHead>
              <TableHead className="text-right">Costo Total</TableHead>
              <TableHead className="text-right">Restante</TableHead>
              <TableHead className="text-right">% vs. presupuesto original</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periodos.map(({ mes, anio, montoForecast }) => {
              const facturadoMes = facturadoPorMes[`${mes}-${anio}`] ?? 0
              const costoTotalMes = costoPorMes[`${mes}-${anio}`] ?? 0
              const restante = (montoForecast ?? 0) - costoTotalMes
              return (
                <TableRow key={`${mes}-${anio}`}>
                  <TableCell>
                    {nombreMes(mes)} {anio}
                  </TableCell>
                  <TableCell className="text-right">
                    {presupuesto ? formatCLP(presupuesto.presupuesto_original) : '—'}
                  </TableCell>
                  <TableCell className="text-right">{montoForecast === null ? '—' : formatCLP(montoForecast)}</TableCell>
                  <TableCell className="text-right">{formatCLP(facturadoMes)}</TableCell>
                  <TableCell className="text-right">{formatCLP(costoTotalMes)}</TableCell>
                  <TableCell className="text-right">{formatCLP(restante)}</TableCell>
                  <TableCell className="text-right">
                    {presupuesto ? formatPct(costoTotalMes / presupuesto.presupuesto_original) : '—'}
                  </TableCell>
                </TableRow>
              )
            })}
            <TableRow className="font-semibold">
              <TableCell>Total</TableCell>
              <TableCell className="text-right">
                {presupuesto ? formatCLP(presupuesto.presupuesto_original) : '—'}
              </TableCell>
              <TableCell className="text-right">{formatCLP(totalForecast)}</TableCell>
              <TableCell className="text-right">{formatCLP(totalFacturado)}</TableCell>
              <TableCell className="text-right">{formatCLP(totalCostoTotal)}</TableCell>
              <TableCell className="text-right">{formatCLP(totalForecast - totalCostoTotal)}</TableCell>
              <TableCell className="text-right">
                {presupuesto ? formatPct(totalCostoTotal / presupuesto.presupuesto_original) : '—'}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
    </div>
  )
}
