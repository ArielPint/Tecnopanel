import { Link, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { cn } from '@/lib/utils'
import PortalLayout from './components/PortalLayout'
import { usePermisosSso } from './hooks/usePermisosSso'
import type { ModuloSso } from './lib/accesos'
import { RUTA } from './lib/rutas'
import Dashboard from './pages/Dashboard'
import Hallazgos from './pages/Hallazgos'
import NuevoHallazgo from './pages/NuevoHallazgo'
import Detalle from './pages/Detalle'
import Indicadores from './pages/Indicadores'
import AreasConfig from './pages/AreasConfig'
import Trabajadores from './pages/Trabajadores'
import Trabajador from './pages/Trabajador'
import { EmpresasConfig, TiposCapacitacionConfig, TiposExamenConfig } from './pages/CatalogosConfig'
import Capacitaciones from './pages/Capacitaciones'
import VigenciasCapacitaciones from './pages/VigenciasCapacitaciones'
import Capacitacion from './pages/Capacitacion'
import FormCapacitacion from './pages/FormCapacitacion'
import EntregasEpp, { ReposicionesEpp } from './pages/EntregasEpp'
import Entrega from './pages/Entrega'
import FormEntrega from './pages/FormEntrega'
import EppConfig from './pages/EppConfig'
import { InspeccionesRealizadas, ProgramaInspecciones } from './pages/InspeccionesListas'
import FormInspeccion from './pages/FormInspeccion'
import Inspeccion from './pages/Inspeccion'
import { FormPlantilla, Plantillas } from './pages/Plantillas'
import Eventos from './pages/Eventos'
import FormEvento from './pages/FormEvento'
import Evento from './pages/Evento'
import IndicadoresAccidentes from './pages/IndicadoresAccidentes'
import DotacionMensual from './pages/DotacionMensual'
import Documentos from './pages/Documentos'
import Documento from './pages/Documento'
import FormDocumento from './pages/FormDocumento'
import { AcuerdosComite, IntegrantesComite, ModuloComite, ReunionesComite } from './pages/Comite'
import Reunion from './pages/Reunion'
import FormReunion from './pages/FormReunion'
import { Plus } from 'lucide-react'
import { Button } from '@/modules/financiero/components/ui/button'

// Portal de Prevención de Riesgos (PLAN_SSO_PORTAL.md): web propia como el CRM, en /prevencion.
// Transversal a la empresa (no depende de proyectos), con un permiso por módulo sobre el ancla
// SSO_ANCLA_ID. La sesión y el acceso al portal los controla ProtectedRoute en App.tsx.

/** Exige 'ver' en el módulo; si no, de vuelta al Dashboard del portal. */
function ConModulo({ modulo, children }: { modulo: ModuloSso; children: React.ReactNode }) {
  const { puedeEn, loading } = usePermisosSso()
  if (loading) return <div className="h-24 animate-pulse rounded bg-muted" />
  if (!puedeEn(modulo, 'ver')) return <Navigate to={RUTA.inicio} replace />
  return <>{children}</>
}

function Pestana({ to, children, end }: { to: string; children: React.ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
        )
      }
    >
      {children}
    </NavLink>
  )
}

function ModuloHallazgos() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Hallazgos</h1>
        <p className="text-sm text-muted-foreground">Reporte, seguimiento y cierre de no conformidades.</p>
      </div>
      <nav className="flex gap-1 border-b">
        <Pestana to={RUTA.hallazgos} end>
          Listado
        </Pestana>
        <Pestana to={RUTA.indicadoresHallazgos}>Indicadores</Pestana>
      </nav>
      <Outlet />
    </div>
  )
}

function ModuloCapacitaciones() {
  const { puede } = usePermisosSso('capacitaciones')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold">Capacitaciones y charlas</h1>
          <p className="text-sm text-muted-foreground">Charlas de 5 minutos, inducciones, ODI, cursos y simulacros, con su asistencia.</p>
        </div>
        {puede('crear') && (
          <Button asChild size="sm">
            <Link to={RUTA.nuevaCapacitacion}>
              <Plus className="mr-1 h-4 w-4" /> Registrar
            </Link>
          </Button>
        )}
      </div>
      <nav className="flex gap-1 border-b">
        <Pestana to={RUTA.capacitaciones} end>
          Registro
        </Pestana>
        <Pestana to={RUTA.vigenciasCapacitaciones}>Vigencias</Pestana>
      </nav>
      <Outlet />
    </div>
  )
}

function ModuloAccidentes() {
  const { puede } = usePermisosSso('accidentes')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold">Accidentes e incidentes</h1>
          <p className="text-sm text-muted-foreground">Registro, investigación de causas, medidas correctivas y tasas legales (Mutual de Seguridad CChC).</p>
        </div>
        {puede('crear') && (
          <Button asChild size="sm">
            <Link to={RUTA.nuevoEvento}>
              <Plus className="mr-1 h-4 w-4" /> Reportar evento
            </Link>
          </Button>
        )}
      </div>
      <nav className="flex gap-1 border-b">
        <Pestana to={RUTA.accidentes} end>
          Registro
        </Pestana>
        <Pestana to={RUTA.indicadoresAccidentes}>Indicadores</Pestana>
        <Pestana to={RUTA.dotacion}>Dotación y HH</Pestana>
      </nav>
      <Outlet />
    </div>
  )
}

function ModuloInspecciones() {
  const { puede } = usePermisosSso('inspecciones')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold">Inspecciones</h1>
          <p className="text-sm text-muted-foreground">Checklists programados por área. Cada ítem que no cumple genera un hallazgo.</p>
        </div>
        {puede('crear') && (
          <Button asChild size="sm">
            <Link to={RUTA.nuevaInspeccion()}>
              <Plus className="mr-1 h-4 w-4" /> Realizar inspección
            </Link>
          </Button>
        )}
      </div>
      <nav className="flex gap-1 border-b">
        <Pestana to={RUTA.inspecciones} end>
          Programa
        </Pestana>
        <Pestana to={RUTA.inspeccionesRealizadas}>Realizadas</Pestana>
        <Pestana to={RUTA.plantillas} end>
          Plantillas
        </Pestana>
      </nav>
      <Outlet />
    </div>
  )
}

function ModuloEpp() {
  const { puede } = usePermisosSso('epp')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold">Entrega de EPP</h1>
          <p className="text-sm text-muted-foreground">Elementos de protección personal entregados a cada trabajador y su reposición.</p>
        </div>
        {puede('crear') && (
          <Button asChild size="sm">
            <Link to={RUTA.nuevaEntrega()}>
              <Plus className="mr-1 h-4 w-4" /> Registrar entrega
            </Link>
          </Button>
        )}
      </div>
      <nav className="flex gap-1 border-b">
        <Pestana to={RUTA.epp} end>
          Entregas
        </Pestana>
        <Pestana to={RUTA.reposicionesEpp}>Reposiciones</Pestana>
      </nav>
      <Outlet />
    </div>
  )
}

function ModuloConfiguracion() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Configuración</h1>
        <p className="text-sm text-muted-foreground">Catálogos que usan todos los módulos del portal.</p>
      </div>
      <nav className="flex gap-1 border-b">
        <Pestana to={RUTA.configuracion} end>
          Áreas
        </Pestana>
        <Pestana to={RUTA.configEmpresas}>Empresas</Pestana>
        <Pestana to={RUTA.configExamenes}>Tipos de examen</Pestana>
        <Pestana to={RUTA.configCapacitaciones}>Tipos de capacitación</Pestana>
        <Pestana to={RUTA.configEpp}>Catálogo de EPP</Pestana>
      </nav>
      <Outlet />
    </div>
  )
}

export default function PrevencionApp() {
  return (
    <Routes>
      <Route element={<PortalLayout />}>
        <Route index element={<Dashboard />} />
        <Route
          path="hallazgos"
          element={
            <ConModulo modulo="hallazgos">
              <ModuloHallazgos />
            </ConModulo>
          }
        >
          <Route index element={<Hallazgos />} />
          <Route path="indicadores" element={<Indicadores />} />
        </Route>
        {/* el formulario y el detalle van sin las pestañas del listado */}
        <Route path="hallazgos/nuevo" element={<ConModulo modulo="hallazgos"><NuevoHallazgo /></ConModulo>} />
        <Route path="hallazgos/:id" element={<ConModulo modulo="hallazgos"><Detalle /></ConModulo>} />
        <Route path="trabajadores" element={<ConModulo modulo="trabajadores"><Trabajadores /></ConModulo>} />
        <Route path="trabajadores/:id" element={<ConModulo modulo="trabajadores"><Trabajador /></ConModulo>} />
        <Route path="configuracion" element={<ConModulo modulo="configuracion"><ModuloConfiguracion /></ConModulo>}>
          <Route index element={<AreasConfig />} />
          <Route path="empresas" element={<EmpresasConfig />} />
          <Route path="examenes" element={<TiposExamenConfig />} />
          <Route path="capacitaciones" element={<TiposCapacitacionConfig />} />
          <Route path="epp" element={<EppConfig />} />
        </Route>
        <Route path="accidentes" element={<ConModulo modulo="accidentes"><ModuloAccidentes /></ConModulo>}>
          <Route index element={<Eventos />} />
          <Route path="indicadores" element={<IndicadoresAccidentes />} />
          <Route path="dotacion" element={<DotacionMensual />} />
        </Route>
        <Route path="accidentes/nuevo" element={<ConModulo modulo="accidentes"><FormEvento /></ConModulo>} />
        <Route path="accidentes/:id" element={<ConModulo modulo="accidentes"><Evento /></ConModulo>} />
        <Route path="accidentes/:id/editar" element={<ConModulo modulo="accidentes"><FormEvento /></ConModulo>} />
        <Route path="inspecciones" element={<ConModulo modulo="inspecciones"><ModuloInspecciones /></ConModulo>}>
          <Route index element={<ProgramaInspecciones />} />
          <Route path="realizadas" element={<InspeccionesRealizadas />} />
          <Route path="plantillas" element={<Plantillas />} />
        </Route>
        <Route path="inspecciones/nueva" element={<ConModulo modulo="inspecciones"><FormInspeccion /></ConModulo>} />
        <Route path="inspecciones/plantillas/nueva" element={<ConModulo modulo="inspecciones"><FormPlantilla /></ConModulo>} />
        <Route path="inspecciones/plantillas/:id" element={<ConModulo modulo="inspecciones"><FormPlantilla /></ConModulo>} />
        <Route path="inspecciones/:id" element={<ConModulo modulo="inspecciones"><Inspeccion /></ConModulo>} />
        <Route path="epp" element={<ConModulo modulo="epp"><ModuloEpp /></ConModulo>}>
          <Route index element={<EntregasEpp />} />
          <Route path="reposiciones" element={<ReposicionesEpp />} />
        </Route>
        <Route path="comite" element={<ConModulo modulo="comite"><ModuloComite /></ConModulo>}>
          <Route index element={<ReunionesComite />} />
          <Route path="acuerdos" element={<AcuerdosComite />} />
          <Route path="integrantes" element={<IntegrantesComite />} />
        </Route>
        <Route path="comite/reuniones/nueva" element={<ConModulo modulo="comite"><FormReunion /></ConModulo>} />
        <Route path="comite/reuniones/:id" element={<ConModulo modulo="comite"><Reunion /></ConModulo>} />
        <Route path="comite/reuniones/:id/editar" element={<ConModulo modulo="comite"><FormReunion /></ConModulo>} />
        <Route path="documentos" element={<ConModulo modulo="documentos"><Documentos /></ConModulo>} />
        <Route path="documentos/nuevo" element={<ConModulo modulo="documentos"><FormDocumento /></ConModulo>} />
        <Route path="documentos/:id" element={<ConModulo modulo="documentos"><Documento /></ConModulo>} />
        <Route path="documentos/:id/editar" element={<ConModulo modulo="documentos"><FormDocumento /></ConModulo>} />
        <Route path="epp/nueva" element={<ConModulo modulo="epp"><FormEntrega /></ConModulo>} />
        <Route path="epp/:id" element={<ConModulo modulo="epp"><Entrega /></ConModulo>} />
        <Route path="epp/:id/editar" element={<ConModulo modulo="epp"><FormEntrega /></ConModulo>} />
        <Route path="capacitaciones" element={<ConModulo modulo="capacitaciones"><ModuloCapacitaciones /></ConModulo>}>
          <Route index element={<Capacitaciones />} />
          <Route path="vigencias" element={<VigenciasCapacitaciones />} />
        </Route>
        <Route path="capacitaciones/nueva" element={<ConModulo modulo="capacitaciones"><FormCapacitacion /></ConModulo>} />
        <Route path="capacitaciones/:id" element={<ConModulo modulo="capacitaciones"><Capacitacion /></ConModulo>} />
        <Route path="capacitaciones/:id/editar" element={<ConModulo modulo="capacitaciones"><FormCapacitacion /></ConModulo>} />
        <Route path="*" element={<Navigate to={RUTA.inicio} replace />} />
      </Route>
    </Routes>
  )
}
