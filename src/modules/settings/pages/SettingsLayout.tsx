import { LogOut } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import isologo from '@/modules/financiero/assets/tecnopanel-isologo-color.png'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/financiero/components/ui/tabs'
import { Button } from '@/modules/financiero/components/ui/button'
import { Avatar, AvatarFallback } from '@/modules/financiero/components/ui/avatar'
import PortalShell from '@/modules/financiero/components/PortalShell'
import { useProyectoActual } from '@/hooks/useProyectoActual'
import { useAuth } from '../hooks/useAuth'
import Config from './Config'

function iniciales(nombre: string | undefined) {
  if (!nombre) return '?'
  return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}

export default function SettingsLayout() {
  const { perfil, signOut } = useAuth()
  const { nombre: nombreProyecto } = useProyectoActual()

  return (
    <PortalShell actual="settings">
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 md:px-6">
        <img src={isologo} alt="" className="size-7 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">{nombreProyecto}</p>
          <p className="text-sm font-bold leading-none">Configuración</p>
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
        <Tabs defaultValue="config">
          <TabsList variant="line" className="mb-4 flex-wrap border-b">
            <TabsTrigger value="config">Configuración</TabsTrigger>
            <TabsTrigger value="admin">Administración</TabsTrigger>
          </TabsList>
          <TabsContent value="config">
            <Config />
          </TabsContent>
          <TabsContent value="admin">
            <Navigate to="/usuarios" replace />
          </TabsContent>
        </Tabs>
      </main>
    </div>
    </PortalShell>
  )
}
