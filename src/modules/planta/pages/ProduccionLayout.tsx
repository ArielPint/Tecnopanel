import { useParams } from 'react-router-dom'
import isologo from '@/modules/financiero/assets/tecnopanel-isologo-color.png'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/financiero/components/ui/tabs'
import { Skeleton } from '@/modules/financiero/components/ui/skeleton'
import { useProyectoActual } from '@/hooks/useProyectoActual'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'
import { useExcelData } from '../hooks/useExcelData'
import ProduccionResumen from './ProduccionResumen'
import ProduccionTorres from './ProduccionTorres'
import ProduccionPartidas from './ProduccionPartidas'
import ProduccionAlertas from './ProduccionAlertas'
import ProduccionDetalle from './ProduccionDetalle'
import ProduccionSubcontrato from './ProduccionSubcontrato'

const TABS = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'torres', label: 'Torres' },
  { value: 'partidas', label: 'Partidas' },
  { value: 'alertas', label: 'Alertas' },
  { value: 'detalle', label: 'Detalle' },
  { value: 'subcontrato', label: 'Subcontrato' },
] as const

export default function ProduccionLayout() {
  const { nombre: nombreProyecto } = useProyectoActual()
  const { proyectoSlug = '' } = useParams<{ proyectoSlug: string }>()
  const acceso = usePermisosProyecto(proyectoSlug)
  const visibles = TABS.filter((t) => acceso.tieneAccion(`produccion:${t.value}`))
  const primerTab = visibles[0]?.value ?? 'resumen'
  // Solo se usa para las fechas planificadas (Alertas/Detalle) — el resto de Producción
  // lee planta_modulos en vivo y funciona igual sin xlsm cargado.
  const { excelData, autoLoading } = useExcelData()

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 md:px-6">
        <img src={isologo} alt="" className="size-7 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">{nombreProyecto}</p>
          <p className="text-sm font-bold leading-none">Producción</p>
        </div>
      </header>

      <main className="min-w-0 flex-1 overflow-x-auto p-4 md:p-6">
        {autoLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-[280px]" />
          </div>
        ) : (
          <Tabs defaultValue={primerTab}>
            <TabsList variant="line" className="mb-4 flex-wrap border-b">
              {visibles.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
              ))}
            </TabsList>
            {visibles.some((t) => t.value === 'resumen') && <TabsContent value="resumen"><ProduccionResumen excelData={excelData} /></TabsContent>}
            {visibles.some((t) => t.value === 'torres') && <TabsContent value="torres"><ProduccionTorres excelData={excelData} /></TabsContent>}
            {visibles.some((t) => t.value === 'partidas') && <TabsContent value="partidas"><ProduccionPartidas excelData={excelData} /></TabsContent>}
            {visibles.some((t) => t.value === 'alertas') && <TabsContent value="alertas"><ProduccionAlertas excelData={excelData} /></TabsContent>}
            {visibles.some((t) => t.value === 'detalle') && <TabsContent value="detalle"><ProduccionDetalle excelData={excelData} /></TabsContent>}
            {visibles.some((t) => t.value === 'subcontrato') && <TabsContent value="subcontrato"><ProduccionSubcontrato /></TabsContent>}
          </Tabs>
        )}
      </main>
    </div>
  )
}
