import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { cn } from '@/lib/utils'
import PortalLayout from './components/PortalLayout'
import { Encabezado } from './components/comunes'
import { usePermisosSip } from './hooks/usePermisosSip'
import type { ModuloSip } from './lib/accesos'
import { RUTA } from './lib/rutas'
import Dashboard from './pages/Dashboard'
import Registro from './pages/Registro'
import FormParte from './pages/FormParte'
import Parte from './pages/Parte'
import Consumo from './pages/Consumo'
import Calculadora from './pages/Calculadora'
import Paneles from './pages/Paneles'
import Panel from './pages/Panel'
import Materiales from './pages/Materiales'
import Proyectos from './pages/Proyectos'

// Portal Producción de Paneles SIP: web propia como el CRM y Prevención, en /produccion.
// Transversal a la empresa, con un permiso por módulo sobre el ancla SIP_ANCLA_ID. La sesión y el
// acceso al portal los controla ProtectedRoute en App.tsx.

/** Exige 'ver' en el módulo; si no, de vuelta al Dashboard del portal. */
function ConModulo({ modulo, children }: { modulo: ModuloSip; children: React.ReactNode }) {
  const { puedeEn, loading } = usePermisosSip()
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

function ModuloConsumo() {
  return (
    <div className="space-y-4">
      <Encabezado titulo="Consumo de materiales" descripcion="Lo que consumió la producción registrada, y cuánto consumiría producir una cantidad." />
      <nav className="flex gap-1 border-b">
        <Pestana to={RUTA.consumo} end>
          Por período
        </Pestana>
        <Pestana to={RUTA.calculadora}>Calculadora</Pestana>
      </nav>
      <Outlet />
    </div>
  )
}

function ModuloRecetas() {
  return (
    <div className="space-y-4">
      <Encabezado titulo="Paneles y recetas" descripcion="Tipos de panel con la cantidad base de cada material por 1 panel, y el listado de proyectos." />
      <nav className="flex gap-1 border-b">
        <Pestana to={RUTA.recetas} end>
          Paneles
        </Pestana>
        <Pestana to={RUTA.materiales}>Materiales</Pestana>
        <Pestana to={RUTA.proyectos}>Proyectos</Pestana>
      </nav>
      <Outlet />
    </div>
  )
}

export default function SipApp() {
  return (
    <Routes>
      <Route element={<PortalLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="registro" element={<ConModulo modulo="produccion"><Registro /></ConModulo>} />
        <Route path="registro/nuevo" element={<ConModulo modulo="produccion"><FormParte /></ConModulo>} />
        <Route path="registro/:id" element={<ConModulo modulo="produccion"><Parte /></ConModulo>} />
        <Route path="registro/:id/editar" element={<ConModulo modulo="produccion"><FormParte /></ConModulo>} />
        <Route path="consumo" element={<ConModulo modulo="consumo"><ModuloConsumo /></ConModulo>}>
          <Route index element={<Consumo />} />
          <Route path="calculadora" element={<Calculadora />} />
        </Route>
        <Route path="recetas" element={<ConModulo modulo="recetas"><ModuloRecetas /></ConModulo>}>
          <Route index element={<Paneles />} />
          <Route path="materiales" element={<Materiales />} />
          <Route path="proyectos" element={<Proyectos />} />
        </Route>
        {/* la ficha del panel va sin las pestañas del listado */}
        <Route path="recetas/nuevo" element={<ConModulo modulo="recetas"><Panel /></ConModulo>} />
        <Route path="recetas/:id" element={<ConModulo modulo="recetas"><Panel /></ConModulo>} />
        <Route path="*" element={<Navigate to={RUTA.inicio} replace />} />
      </Route>
    </Routes>
  )
}
