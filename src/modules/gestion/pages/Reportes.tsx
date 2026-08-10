import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import type { ProyectoObra } from '@/hooks/useAccesoUsuario'
import { useReportesFinancieros } from '../hooks/useReportesFinancieros'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'
import { formatCLP, formatPct } from '@/modules/financiero/utils/formatters'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/financiero/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function ExportButton({ nombre, filas }: { nombre: string; filas: Record<string, unknown>[] }) {
  return (
    <Button size="sm" variant="outline" className="gap-1.5" disabled={filas.length === 0} onClick={() => exportarExcel(nombre, filas)}>
      <Download size={14} /> Exportar
    </Button>
  )
}

export default function Reportes({ proyectosObra }: { proyectosObra: ProyectoObra[] }) {
  const [proyectoId, setProyectoId] = useState<string | null>(null)

  useEffect(() => {
    if (!proyectoId && proyectosObra.length > 0) setProyectoId(proyectosObra[0].id)
  }, [proyectosObra, proyectoId])

  const { seguimiento, estadoResultado, detalle, loading, error } = useReportesFinancieros(proyectoId)
  const proyectoNombre = proyectosObra.find((p) => p.id === proyectoId)?.nombre ?? ''

  if (proyectosObra.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Sin reportes disponibles para tu acceso actual — Reportes v1 solo cubre proyectos de obra (Financiero). CRM
        todavía no tiene reportes en este módulo.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1.5 sm:w-72">
        <Select value={proyectoId ?? undefined} onValueChange={setProyectoId}>
          <SelectTrigger>
            <SelectValue placeholder="Elegir proyecto" />
          </SelectTrigger>
          <SelectContent>
            {proyectosObra.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Error al cargar reportes: {error}
        </div>
      )}

      <Tabs defaultValue="seguimiento">
        <TabsList>
          <TabsTrigger value="seguimiento">Seguimiento Presupuesto</TabsTrigger>
          <TabsTrigger value="estado-resultado">Estado de Resultado</TabsTrigger>
          <TabsTrigger value="detalle">Detalle por Partida</TabsTrigger>
        </TabsList>

        <TabsContent value="seguimiento" className="pt-3">
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">Seguimiento de Presupuesto — {proyectoNombre}</p>
                <ExportButton
                  nombre={`seguimiento_presupuesto_${proyectoNombre}`}
                  filas={seguimiento.map((s) => ({
                    Código: s.codigo_articulo,
                    Nombre: s.nombre,
                    Presupuesto: s.presupuesto_original,
                    Forecast: s.forecast_actual,
                    'OC ingresadas': s.oc_ingresadas,
                    Facturado: s.facturado,
                    '% Avance': s.pct_avance,
                  }))}
                />
              </div>
              {loading ? (
                <div className="h-24 animate-pulse rounded bg-muted" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-right">Presupuesto</TableHead>
                      <TableHead className="text-right">Forecast</TableHead>
                      <TableHead className="text-right">OC ingresadas</TableHead>
                      <TableHead className="text-right">Facturado</TableHead>
                      <TableHead className="text-right">% Avance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {seguimiento.map((s) => (
                      <TableRow key={s.presupuesto_id}>
                        <TableCell>{s.codigo_articulo}</TableCell>
                        <TableCell>{s.nombre}</TableCell>
                        <TableCell className="text-right">{formatCLP(s.presupuesto_original)}</TableCell>
                        <TableCell className="text-right">{formatCLP(s.forecast_actual)}</TableCell>
                        <TableCell className="text-right">{formatCLP(s.oc_ingresadas)}</TableCell>
                        <TableCell className="text-right">{formatCLP(s.facturado)}</TableCell>
                        <TableCell className="text-right">{formatPct(s.pct_avance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="estado-resultado" className="pt-3">
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">Estado de Resultado Mensual — {proyectoNombre}</p>
                <ExportButton
                  nombre={`estado_resultado_${proyectoNombre}`}
                  filas={estadoResultado.map((e) => ({
                    Mes: `${MESES[e.mes - 1]} ${e.anio}`,
                    Costos: e.costos,
                    Ingresos: e.ingresos,
                    Margen: e.margen,
                    EBITDA: e.ebitda,
                  }))}
                />
              </div>
              {loading ? (
                <div className="h-24 animate-pulse rounded bg-muted" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mes</TableHead>
                      <TableHead className="text-right">Costos</TableHead>
                      <TableHead className="text-right">Ingresos</TableHead>
                      <TableHead className="text-right">Margen</TableHead>
                      <TableHead className="text-right">EBITDA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {estadoResultado.map((e) => (
                      <TableRow key={`${e.anio}-${e.mes}`}>
                        <TableCell>
                          {MESES[e.mes - 1]} {e.anio}
                        </TableCell>
                        <TableCell className="text-right">{formatCLP(e.costos)}</TableCell>
                        <TableCell className="text-right">{formatCLP(e.ingresos)}</TableCell>
                        <TableCell className="text-right">{formatCLP(e.margen)}</TableCell>
                        <TableCell className="text-right">{formatCLP(e.ebitda)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detalle" className="pt-3">
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">Detalle por Partida — {proyectoNombre}</p>
                <ExportButton
                  nombre={`detalle_partida_${proyectoNombre}`}
                  filas={detalle.map((d) => ({
                    Código: d.codigo_articulo,
                    Nombre: d.nombre,
                    Categoría: d.categoria,
                    Mes: `${MESES[d.mes - 1]} ${d.anio}`,
                    Monto: d.monto,
                  }))}
                />
              </div>
              {loading ? (
                <div className="h-24 animate-pulse rounded bg-muted" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Mes</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalle.map((d, i) => (
                      <TableRow key={`${d.codigo_articulo}-${d.categoria}-${d.anio}-${d.mes}-${i}`}>
                        <TableCell>{d.codigo_articulo}</TableCell>
                        <TableCell>{d.nombre}</TableCell>
                        <TableCell>{d.categoria}</TableCell>
                        <TableCell>
                          {MESES[d.mes - 1]} {d.anio}
                        </TableCell>
                        <TableCell className="text-right">{formatCLP(d.monto)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
