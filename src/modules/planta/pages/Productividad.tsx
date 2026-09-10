import { Download, Info } from 'lucide-react'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Skeleton } from '@/modules/financiero/components/ui/skeleton'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'
import { IndicadoresFecha } from '@/components/IndicadoresFecha'
import { cn } from '@/lib/utils'
import type { ParsedDashboardData } from '../lib/excelParser'
import { useProductividadData } from '../hooks/useProductividadData'

const fmtNum = (v: number | null | undefined, dec = 0) =>
  v == null ? '—' : v.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const fmtMonto = (v: number | null | undefined) => (v == null || v === 0 ? '—' : formatCLP(v))

function Kpi({ label, value, sub, tono }: { label: string; value: string; sub?: string; tono?: 'success' | 'warning' }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums', tono === 'success' && 'text-success', tono === 'warning' && 'text-warning')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export default function Productividad({ excelData }: { excelData: ParsedDashboardData | null }) {
  const d = useProductividadData(excelData)
  const ultimo = [...d.filas].reverse().find((f) => f.costoEmpresa > 0)

  function exportar() {
    exportarExcel(
      'productividad_mod',
      d.filas.map((f) => ({
        Mes: f.label,
        Personas: f.personas,
        'Días-hombre': Math.round(f.diasHombre),
        'Costo empresa s/HHEE ni bono': Math.round(f.costoBase),
        'Horas extras': Math.round(f.horasExtras),
        'Bono de producción': Math.round(f.bonoProduccion),
        'Costo empresa total': Math.round(f.costoEmpresa),
        'm2 del mes': +f.m2.toFixed(1),
        'Módulos iniciados': f.iniciados,
        'Módulos terminados': f.terminados,
        '$ por m2 s/HHEE ni bono': f.costoM2Base != null ? Math.round(f.costoM2Base) : '',
        '$ por m2 total': f.costoM2 != null ? Math.round(f.costoM2) : '',
        'm2 por persona': f.m2Persona != null ? +f.m2Persona.toFixed(1) : '',
        'm2 por día-hombre': f.m2DiaHombre != null ? +f.m2DiaHombre.toFixed(2) : '',
        '$ por persona': f.costoPersona != null ? Math.round(f.costoPersona) : '',
      })),
    )
  }

  return (
    <div className="space-y-4">
      <IndicadoresFecha />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">Productividad de mano de obra directa</CardTitle>
          <CardDescription>
            Los m² salen de la hoja CURVA del Excel del proyecto (columna "M2 Avance Diario Real"): son m²
            equivalentes de avance del mes, o sea módulos iniciados, en proceso y terminados dentro del mes,
            no solo los terminados. La dotación, los días-hombre y el costo empresa se cargan mes a mes en
            Configuración desde la planilla de remuneraciones. Las horas extras (columna L) y el bono de
            producción (columna M) se muestran aparte, y el costo base es el costo empresa menos esos dos
            conceptos — las cotizaciones y cargas que se pagan sobre ellos quedan del lado del costo base,
            porque la planilla no las abre por concepto.
          </CardDescription>
        </CardHeader>
        {d.mesesSinDotacion.length > 0 && (
          <CardContent className="pt-0">
            <p className="flex items-center gap-1.5 text-xs text-warning">
              <Info className="size-3.5 shrink-0" />
              Sin dotación cargada: {d.mesesSinDotacion.join(', ')} — esos meses no calculan $/m².
            </p>
          </CardContent>
        )}
      </Card>

      {d.loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label={ultimo ? `Último mes cargado · ${ultimo.label}` : 'Último mes cargado'}
              value={ultimo ? fmtNum(ultimo.personas) + ' pers.' : '—'}
              sub={ultimo ? `${fmtNum(ultimo.diasHombre)} días-hombre · ${formatCLP(ultimo.costoEmpresa)}` : 'Cargá la dotación en Configuración'}
            />
            <Kpi label="m² del último mes" value={ultimo ? fmtNum(ultimo.m2, 1) : '—'} sub={ultimo ? `${fmtNum(ultimo.terminados)} módulos terminados` : undefined} />
            <Kpi
              label="$ MOD por m² (último mes)"
              value={ultimo ? fmtMonto(ultimo.costoM2) : '—'}
              sub={ultimo ? `${fmtMonto(ultimo.costoM2Base)} sin HHEE ni bono` : undefined}
              tono="warning"
            />
            <Kpi
              label="$ MOD por m² (acumulado)"
              value={fmtMonto(d.totales.costoM2)}
              sub={`${fmtMonto(d.totales.costoM2Base)} sin HHEE ni bono · ${fmtNum(d.totales.meses)} mes(es) · ${fmtNum(d.totales.m2, 1)} m²`}
              tono="success"
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Personas, m² y costo por mes</CardTitle>
              <CardDescription>Costo empresa total de la mano de obra directa contra la superficie ejecutada</CardDescription>
              <CardAction>
                <Button size="sm" variant="outline" onClick={exportar} disabled={d.filas.length === 0}>
                  <Download className="size-3.5" /> Exportar
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mes</TableHead>
                      <TableHead className="text-right">Personas</TableHead>
                      <TableHead className="text-right">Días-hombre</TableHead>
                      <TableHead className="text-right">Costo s/HHEE ni bono</TableHead>
                      <TableHead className="text-right">Horas extras</TableHead>
                      <TableHead className="text-right">Bono producción</TableHead>
                      <TableHead className="text-right">Costo empresa total</TableHead>
                      <TableHead className="text-right">m² del mes</TableHead>
                      <TableHead className="text-right">Módulos term.</TableHead>
                      <TableHead className="text-right">$ por m² s/HHEE</TableHead>
                      <TableHead className="text-right">$ por m² total</TableHead>
                      <TableHead className="text-right">m² por persona</TableHead>
                      <TableHead className="text-right">m² por día-hombre</TableHead>
                      <TableHead className="text-right">$ por persona</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.filas.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={14} className="py-8 text-center text-sm text-muted-foreground">
                          Sin datos: falta el Excel del proyecto o la dotación mensual.
                        </TableCell>
                      </TableRow>
                    )}
                    {d.filas.map((f) => (
                      <TableRow key={`${f.anio}-${f.mes}`} className={f.costoEmpresa === 0 ? 'text-muted-foreground' : undefined}>
                        <TableCell className="font-medium">{f.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.personas || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.diasHombre ? fmtNum(f.diasHombre) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMonto(f.costoBase)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMonto(f.horasExtras)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMonto(f.bonoProduccion)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMonto(f.costoEmpresa)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(f.m2, 1)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(f.terminados)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMonto(f.costoM2Base)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{fmtMonto(f.costoM2)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(f.m2Persona, 1)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(f.m2DiaHombre, 2)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMonto(f.costoPersona)}</TableCell>
                      </TableRow>
                    ))}
                    {d.totales.meses > 0 && (
                      <TableRow className="border-t-2 font-semibold">
                        <TableCell>Total ({d.totales.meses} mes/es con dotación)</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(d.totales.personas, 1)} prom.</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(d.totales.diasHombre)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMonto(d.totales.costoBase)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMonto(d.totales.horasExtras)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMonto(d.totales.bonoProduccion)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMonto(d.totales.costoEmpresa)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(d.totales.m2, 1)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(d.totales.terminados)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMonto(d.totales.costoM2Base)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMonto(d.totales.costoM2)}</TableCell>
                        <TableCell className="text-right">—</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(d.totales.m2DiaHombre, 2)}</TableCell>
                        <TableCell className="text-right">—</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
