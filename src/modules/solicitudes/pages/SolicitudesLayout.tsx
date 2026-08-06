import { LogOut } from 'lucide-react'
import isologo from '@/modules/financiero/assets/tecnopanel-isologo-color.png'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/financiero/components/ui/tabs'
import { Button } from '@/modules/financiero/components/ui/button'
import { Avatar, AvatarFallback } from '@/modules/financiero/components/ui/avatar'
import PortalShell from '@/modules/financiero/components/PortalShell'
import { useProyectoActual } from '@/hooks/useProyectoActual'
import Catalogo from '@/modules/logistica/pages/Catalogo'
import { AuthProvider as LogisticaAuthProvider } from '@/modules/logistica/hooks/useAuth'
import { useAuth, type SolicitudesTab } from '../hooks/useAuth'
import NuevaSolicitud from './NuevaSolicitud'
import Historial from './Historial'
import RecetaGrupo from './RecetaGrupo'

const TABS: { value: SolicitudesTab; label: string }[] = [
  { value: 'nueva', label: '📋 Nueva Solicitud' },
  { value: 'historial', label: '📂 Historial' },
  { value: 'receta', label: '🧾 Receta por Grupo' },
  { value: 'catalogo', label: '🗂 Catálogo' },
]

function iniciales(nombre: string | undefined) {
  if (!nombre) return '?'
  return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}

export default function SolicitudesLayout() {
  const { perfil, puedeVer, signOut } = useAuth()
  const { nombre: nombreProyecto } = useProyectoActual()
  const visibles = TABS.filter((t) => puedeVer(t.value))
  const primerTab = visibles[0]?.value ?? 'nueva'

  return (
    <PortalShell actual="solicitudes">
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 md:px-6">
        <img src={isologo} alt="" className="size-7 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">{nombreProyecto}</p>
          <p className="text-sm font-bold leading-none">Solicitud de Materiales</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">{iniciales(perfil?.name)}</AvatarFallback>
          </Avatar>
          <Button variant="ghost" size="icon" onClick={signOut} title="Salir">
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <main className="min-w-0 flex-1 overflow-x-auto p-4 md:p-6">
        <Tabs defaultValue={primerTab}>
          <TabsList variant="line" className="mb-4 flex-wrap border-b">
            {visibles.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="nueva">
            <NuevaSolicitud />
          </TabsContent>
          <TabsContent value="historial">
            <Historial />
          </TabsContent>
          <TabsContent value="receta">
            <RecetaGrupo />
          </TabsContent>
          <TabsContent value="catalogo">
            <LogisticaAuthProvider>
              <Catalogo />
            </LogisticaAuthProvider>
          </TabsContent>
        </Tabs>
      </main>
    </div>
    </PortalShell>
  )
}
