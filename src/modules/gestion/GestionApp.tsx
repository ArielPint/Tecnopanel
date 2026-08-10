import { useAccesoUsuario } from '@/hooks/useAccesoUsuario'
import Reportes from './pages/Reportes'
import Calendarizacion from './pages/Calendarizacion'
import Documentos from './pages/Documentos'
import Comunicaciones from './pages/Comunicaciones'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/financiero/components/ui/tabs'

// Módulo "Gestión" transversal (§3.6/§3.6.1-§3.6.5) — global del hub, no vive bajo un proyecto.
// Reportes, Calendarización, Documentos y Comunicaciones construidas. Alertas postergada
// (§3.6.4 — notifications es personal/CRM, ya visible en la campana del CRM, sin fuente de
// proyecto/obra que agregar) — sin pestaña ni placeholder, no forma parte del roadmap hasta
// que el usuario decida retomarla.

export default function GestionApp() {
  const { proyectosObra, tieneCrm, loading } = useAccesoUsuario()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Gestión</h1>
        <p className="text-sm text-muted-foreground">Reportes, documentos y comunicaciones transversales a todo el portal.</p>
      </div>

      <Tabs defaultValue="reportes">
        <TabsList>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
          <TabsTrigger value="calendarizacion">Calendarización</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="comunicaciones">Comunicaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="reportes" className="pt-3">
          {loading ? <div className="h-24 animate-pulse rounded bg-muted" /> : <Reportes proyectosObra={proyectosObra} />}
        </TabsContent>
        <TabsContent value="calendarizacion" className="pt-3">
          {loading ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : (
            <Calendarizacion proyectosObra={proyectosObra} tieneCrm={tieneCrm} />
          )}
        </TabsContent>
        <TabsContent value="documentos" className="pt-3">
          {loading ? <div className="h-24 animate-pulse rounded bg-muted" /> : <Documentos proyectosObra={proyectosObra} tieneCrm={tieneCrm} />}
        </TabsContent>
        <TabsContent value="comunicaciones" className="pt-3">
          {loading ? <div className="h-24 animate-pulse rounded bg-muted" /> : <Comunicaciones tieneCrm={tieneCrm} />}
        </TabsContent>
      </Tabs>
    </div>
  )
}
