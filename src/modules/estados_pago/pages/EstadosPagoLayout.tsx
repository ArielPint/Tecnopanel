import { LogOut } from 'lucide-react'
import isologo from '@/modules/financiero/assets/tecnopanel-isologo-color.png'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/financiero/components/ui/tabs'
import { Button } from '@/modules/financiero/components/ui/button'
import PortalShell from '@/modules/financiero/components/PortalShell'
import { useProyectoActual } from '@/hooks/useProyectoActual'
import { useAuth } from '../hooks/useAuth'
import Listado from './Listado'
import Subcontratos from './Subcontratos'

const TABS: { value: 'listado' | 'subcontratos'; label: string }[] = [
  { value: 'listado', label: 'Estados de Pago' },
  { value: 'subcontratos', label: 'Subcontratos' },
]

export default function EstadosPagoLayout() {
  const { signOut, puedeVerTab } = useAuth()
  const { nombre: nombreProyecto } = useProyectoActual()
  const visibles = TABS.filter((t) => puedeVerTab(t.value))
  const primerTab = visibles[0]?.value ?? 'listado'

  return (
    <PortalShell actual="estados_pago">
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 md:px-6">
        <img src={isologo} alt="" className="size-7 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">{nombreProyecto}</p>
          <p className="text-sm font-bold leading-none">Estados de Pago</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={signOut} title="Salir">
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <main className="min-w-0 flex-1 overflow-x-auto p-4 md:p-6">
        <Tabs defaultValue={primerTab}>
          <TabsList variant="line" className="mb-4 flex-wrap border-b">
            {visibles.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
          {puedeVerTab('listado') && (
            <TabsContent value="listado">
              <Listado />
            </TabsContent>
          )}
          {puedeVerTab('subcontratos') && (
            <TabsContent value="subcontratos">
              <Subcontratos />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
    </PortalShell>
  )
}
