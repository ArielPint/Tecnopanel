import { LogOut } from 'lucide-react'
import isologo from '@/modules/financiero/assets/tecnopanel-isologo-color.png'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/financiero/components/ui/tabs'
import { Button } from '@/modules/financiero/components/ui/button'
import PortalShell from '@/modules/financiero/components/PortalShell'
import { useProyectoActual } from '@/hooks/useProyectoActual'
import { useAuth as useAuthProveedores } from '../hooks/useAuth'
import { useAuth as useAuthIngresos } from '@/modules/estados_pago_ingresos/hooks/useAuth'
import Listado from './Listado'
import Subcontratos from './Subcontratos'
import ListadoIngresos from '@/modules/estados_pago_ingresos/pages/Listado'
import ConfiguracionIngresos from '@/modules/estados_pago_ingresos/pages/Configuracion'

const TABS_PROVEEDORES: { value: 'listado' | 'subcontratos'; label: string }[] = [
  { value: 'listado', label: 'Estados de Pago' },
  { value: 'subcontratos', label: 'Subcontratos' },
]

const TABS_INGRESOS: { value: 'listado' | 'configuracion'; label: string }[] = [
  { value: 'listado', label: 'Estados de Pago' },
  { value: 'configuracion', label: 'Configuración' },
]

// Un solo ítem de menú "Estados de Pago" con dos secciones (Proveedores /
// Ingresos) — cada una mantiene su propio módulo de permisos (`estados_pago`
// / `estados_pago_ingresos`) por debajo, solo se fusionó la navegación.
export default function EstadosPagoLayout() {
  const proveedores = useAuthProveedores()
  const ingresos = useAuthIngresos()
  const { nombre: nombreProyecto } = useProyectoActual()

  const seccionesVisibles = [
    proveedores.puedeVer && { value: 'proveedores' as const, label: 'Proveedores' },
    ingresos.puedeVer && { value: 'ingresos' as const, label: 'Ingresos' },
  ].filter((s): s is { value: 'proveedores' | 'ingresos'; label: string } => !!s)
  const primeraSeccion = seccionesVisibles[0]?.value ?? 'proveedores'

  const tabsProveedoresVisibles = TABS_PROVEEDORES.filter((t) => proveedores.puedeVerTab(t.value))
  const tabsIngresosVisibles = TABS_INGRESOS.filter((t) => ingresos.puedeVerTab(t.value))

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
          <Button variant="ghost" size="icon" onClick={proveedores.signOut} title="Salir">
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <main className="min-w-0 flex-1 overflow-x-auto p-4 md:p-6">
        <Tabs defaultValue={primeraSeccion}>
          <TabsList variant="line" className="mb-4 flex-wrap border-b">
            {seccionesVisibles.map((s) => (
              <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
            ))}
          </TabsList>

          {proveedores.puedeVer && (
            <TabsContent value="proveedores">
              <Tabs defaultValue={tabsProveedoresVisibles[0]?.value ?? 'listado'}>
                <TabsList variant="line" className="mb-4 flex-wrap border-b">
                  {tabsProveedoresVisibles.map((t) => (
                    <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
                  ))}
                </TabsList>
                {proveedores.puedeVerTab('listado') && (
                  <TabsContent value="listado">
                    <Listado />
                  </TabsContent>
                )}
                {proveedores.puedeVerTab('subcontratos') && (
                  <TabsContent value="subcontratos">
                    <Subcontratos />
                  </TabsContent>
                )}
              </Tabs>
            </TabsContent>
          )}

          {ingresos.puedeVer && (
            <TabsContent value="ingresos">
              <Tabs defaultValue={tabsIngresosVisibles[0]?.value ?? 'listado'}>
                <TabsList variant="line" className="mb-4 flex-wrap border-b">
                  {tabsIngresosVisibles.map((t) => (
                    <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
                  ))}
                </TabsList>
                {ingresos.puedeVerTab('listado') && (
                  <TabsContent value="listado">
                    <ListadoIngresos />
                  </TabsContent>
                )}
                {ingresos.puedeVerTab('configuracion') && (
                  <TabsContent value="configuracion">
                    <ConfiguracionIngresos />
                  </TabsContent>
                )}
              </Tabs>
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
    </PortalShell>
  )
}
