import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/financiero/components/ui/tabs'
import Catalogo from './Catalogo'
import Responsables from './Responsables'
import OrdenesCompra from './OrdenesCompra'
import Registro from './Registro'

const SUBTABS = [
  { value: 'catalogo', label: 'Catálogo', implementado: true },
  { value: 'responsables', label: 'Responsables', implementado: true },
  { value: 'oc', label: 'Órdenes de Compra', implementado: true },
  { value: 'registro', label: 'Registro', implementado: true },
]

export default function RegistroGD() {
  return (
    <Tabs defaultValue="catalogo">
      <TabsList variant="line" className="mb-4 flex-wrap border-b">
        {SUBTABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value} disabled={!t.implementado}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="catalogo">
        <Catalogo />
      </TabsContent>
      <TabsContent value="responsables">
        <Responsables />
      </TabsContent>
      <TabsContent value="oc">
        <OrdenesCompra />
      </TabsContent>
      <TabsContent value="registro">
        <Registro />
      </TabsContent>
      {SUBTABS.filter((t) => !t.implementado).map((t) => (
        <TabsContent key={t.value} value={t.value}>
          <p className="py-10 text-center text-sm text-muted-foreground">Próximamente</p>
        </TabsContent>
      ))}
    </Tabs>
  )
}
