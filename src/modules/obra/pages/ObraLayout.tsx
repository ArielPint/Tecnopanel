import { useParams } from 'react-router-dom'
import isologo from '@/modules/financiero/assets/tecnopanel-isologo-color.png'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/financiero/components/ui/tabs'
import { useProyectoActual } from '@/hooks/useProyectoActual'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'
import PorContratista from './PorContratista'
import VistaGeneral from './VistaGeneral'
import EntregaCliente from './EntregaCliente'
import Configuracion from './Configuracion'

const TABS = [
  { value: 'contratista', label: 'Por Contratista' },
  { value: 'general', label: 'Vista General' },
  { value: 'entrega', label: 'Entrega a Cliente' },
  { value: 'configuracion', label: 'Configuración' },
] as const

export default function ObraLayout() {
  const { nombre: nombreProyecto } = useProyectoActual()
  const { proyectoSlug = '' } = useParams<{ proyectoSlug: string }>()
  const acceso = usePermisosProyecto(proyectoSlug)
  const visibles = TABS.filter((t) => acceso.tieneAccion(`obra:${t.value}`))
  const primerTab = visibles[0]?.value ?? 'contratista'

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 md:px-6">
        <img src={isologo} alt="" className="size-7 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">{nombreProyecto}</p>
          <p className="text-sm font-bold leading-none">Avance Obra — CR</p>
        </div>
      </header>

      <main className="min-w-0 flex-1 overflow-x-auto p-4 md:p-6">
        <Tabs defaultValue={primerTab}>
          <TabsList variant="line" className="mb-4 flex-wrap border-b">
            {visibles.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
          </TabsList>
          {visibles.some((t) => t.value === 'contratista') && <TabsContent value="contratista"><PorContratista /></TabsContent>}
          {visibles.some((t) => t.value === 'general') && <TabsContent value="general"><VistaGeneral /></TabsContent>}
          {visibles.some((t) => t.value === 'entrega') && <TabsContent value="entrega"><EntregaCliente /></TabsContent>}
          {visibles.some((t) => t.value === 'configuracion') && <TabsContent value="configuracion"><Configuracion /></TabsContent>}
        </Tabs>
      </main>
    </div>
  )
}
