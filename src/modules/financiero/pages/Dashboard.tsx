import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/financiero/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import TablaPresupuestoResumen from '@/modules/financiero/components/TablaPresupuestoResumen'
import TablaForecastMensual from '@/modules/financiero/components/TablaForecastMensual'
import KpiCardsResumen from '@/modules/financiero/components/KpiCardsResumen'
import GraficoPresupuestoPorPartida from '@/modules/financiero/components/GraficoPresupuestoPorPartida'
import GraficoComposicionGlobal from '@/modules/financiero/components/GraficoComposicionGlobal'
import GraficoFacturadoPorMes from '@/modules/financiero/components/GraficoFacturadoPorMes'
import EstadoResultadoMensualView from '@/modules/financiero/components/EstadoResultadoMensual'
import { useSeguimiento } from '@/modules/financiero/hooks/useSeguimiento'
import { useEstadoResultado } from '@/modules/financiero/hooks/useEstadoResultado'
import { useEstadoResultadoDetalle } from '@/modules/financiero/hooks/useEstadoResultadoDetalle'

export default function Dashboard() {
  const { seguimiento, loading, error } = useSeguimiento()
  const { estadoResultado, loading: loadingResultado, error: errorResultado } = useEstadoResultado()
  const { detalle: detalleResultado, loading: loadingDetalle } = useEstadoResultadoDetalle()

  return (
    <div className="space-y-4">
      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Indicadores</p>
      <KpiCardsResumen seguimiento={seguimiento} loading={loading} />

      <div className="space-y-3">
        <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
          Estado de Resultado Mensual
        </p>
        <EstadoResultadoMensualView
          estadoResultado={estadoResultado}
          detalle={detalleResultado}
          loading={loadingResultado || loadingDetalle}
          error={errorResultado}
        />
      </div>

      <Tabs defaultValue="total">
        <TabsList variant="line" className="border-b">
          <TabsTrigger value="total">Total</TabsTrigger>
          <TabsTrigger value="por-mes">Por Mes</TabsTrigger>
          <TabsTrigger value="graficos">Gráficos</TabsTrigger>
        </TabsList>
        <TabsContent value="total" className="mt-4">
          <TablaPresupuestoResumen seguimiento={seguimiento} loading={loading} error={error} />
        </TabsContent>
        <TabsContent value="por-mes" className="mt-4">
          <TablaForecastMensual />
        </TabsContent>
        <TabsContent value="graficos" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  Presupuesto vs. OC vs. Facturado por partida
                </CardTitle>
              </CardHeader>
              <CardContent>
                <GraficoPresupuestoPorPartida seguimiento={seguimiento} loading={loading} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  Avance global
                </CardTitle>
              </CardHeader>
              <CardContent>
                <GraficoComposicionGlobal seguimiento={seguimiento} loading={loading} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-[.75rem] font-semibold tracking-wide text-muted-foreground uppercase">
                Facturado por mes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <GraficoFacturadoPorMes />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
