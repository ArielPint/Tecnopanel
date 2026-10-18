import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AlertOctagon, ArrowLeft, BarChart3, Building2, CalendarRange, ClipboardList, Factory, KeyRound, LogOut, Menu, Moon, PackageSearch, PiggyBank, Plus, Receipt, Settings2, ShoppingCart, Sun, Warehouse } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { useOtrosPortales } from '@/hooks/useOtrosPortales'
import ChangePasswordDialog from '@/components/ChangePasswordDialog'
import { TecnopanelMark } from '@/components/TecnopanelLogo'
import { Button } from '@/modules/financiero/components/ui/button'
import { Sheet, SheetContent } from '@/modules/financiero/components/ui/sheet'
import { Toaster } from '@/modules/financiero/components/ui/sonner'
import { cn } from '@/lib/utils'
import { RUTA } from '../lib/rutas'
import { usePermisosAdq } from '../hooks/usePermisosAdq'

// Contenedor del portal Adquisiciones: mismo esquema que Ingreso de Personal (menú propio, login
// propio), con los tokens del hub para que el modo claro y el oscuro funcionen igual.

function Menu_({ onNavigate }: { onNavigate?: () => void }) {
  const { puedeSolicitar, esCompras, veControl, veReposicion, tiene } = usePermisosAdq()
  const { conHub, portales } = useOtrosPortales({ tipo: 'adquisiciones' })
  const items = [
    ...(veControl ? [{ to: RUTA.dashboard, label: 'Dashboard', icon: BarChart3, end: true }] : []),
    { to: RUTA.inicio, label: 'Solicitudes', icon: ClipboardList, end: true },
    ...(puedeSolicitar ? [{ to: RUTA.nueva, label: 'Nueva solicitud', icon: Plus, end: true }] : []),
    ...(esCompras ? [{ to: RUTA.ordenes, label: 'Órdenes de compra SAP', icon: Receipt, end: true }] : []),
    ...(veReposicion ? [{ to: RUTA.reposicion, label: 'Reposición de stock', icon: PackageSearch, end: true }] : []),
    ...(veReposicion ? [{ to: RUTA.bodega, label: 'Bodega', icon: Warehouse, end: true }] : []),
    ...(veReposicion || veControl ? [{ to: RUTA.planificacion, label: 'Planificación', icon: Factory, end: true }] : []),
    ...(veReposicion || veControl ? [{ to: RUTA.planes, label: 'Planes de compra', icon: CalendarRange, end: false }] : []),
    ...(esCompras ? [{ to: RUTA.proveedores, label: 'Proveedores', icon: Building2, end: false }] : []),
    ...(esCompras ? [{ to: RUTA.nc, label: 'No conformidades', icon: AlertOctagon, end: true }] : []),
    ...(tiene('jefe_compras') ? [{ to: RUTA.presupuestos, label: 'Presupuestos por CECO', icon: PiggyBank, end: true }] : []),
    ...(tiene('jefe_compras') ? [{ to: RUTA.configuracion, label: 'Niveles de aprobación', icon: Settings2, end: true }] : []),
  ]

  return (
    <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-4">
      <div className="flex-1 space-y-6">
        <div className="space-y-0.5">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-[13.5px] font-semibold transition-colors',
                  isActive ? 'border-brand bg-brand/10 text-brand' : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                )
              }
            >
              <it.icon className="h-[18px] w-[18px] shrink-0" />
              {it.label}
            </NavLink>
          ))}
        </div>
        {portales.length > 0 && (
          <div>
            <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Otros portales</p>
            <div className="space-y-0.5">
              {portales.map((pt) => (
                <Link
                  key={pt.to}
                  to={pt.to}
                  onClick={onNavigate}
                  className="flex items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <pt.icon className="h-[18px] w-[18px] shrink-0" />
                  {pt.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
      {conHub && (
        <Link
          to="/"
          onClick={onNavigate}
          className="mt-4 flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-[18px] w-[18px]" /> Volver al hub
        </Link>
      )}
    </nav>
  )
}

function Marca() {
  return (
    <div className="flex h-[60px] shrink-0 items-center gap-2.5 border-b border-border px-4">
      <TecnopanelMark size={28} className="shrink-0" />
      <div className="leading-tight">
        <p className="text-sm font-extrabold">Adquisiciones</p>
        <p className="text-[11px] text-muted-foreground">Solicitudes de compra</p>
      </div>
    </div>
  )
}

const TITULOS: Record<string, string> = {
  [RUTA.inicio]: 'Solicitudes',
  [RUTA.nueva]: 'Nueva solicitud',
  [RUTA.dashboard]: 'Dashboard',
  [RUTA.ordenes]: 'Órdenes de compra SAP',
  [RUTA.reposicion]: 'Reposición de stock',
  [RUTA.bodega]: 'Bodega',
  [RUTA.planificacion]: 'Planificación',
  [RUTA.planes]: 'Planes de compra',
  [RUTA.proveedores]: 'Proveedores',
  [RUTA.nc]: 'No conformidades',
  [RUTA.presupuestos]: 'Presupuestos por CECO',
  [RUTA.configuracion]: 'Niveles de aprobación',
}

export default function PortalLayout() {
  const { user, signOut } = useAuthStore()
  const mode = useThemeStore((s) => s.mode)
  const toggleMode = useThemeStore((s) => s.toggleMode)
  const { puedeSolicitar } = usePermisosAdq()
  const location = useLocation()
  const [menuMovil, setMenuMovil] = useState(false)
  const [cambiarClave, setCambiarClave] = useState(false)
  const isDark = mode === 'dark'

  const titulo = TITULOS[location.pathname] ?? 'Detalle'

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <Marca />
        <Menu_ />
      </aside>

      <Sheet open={menuMovil} onOpenChange={setMenuMovil}>
        <SheetContent side="left" className="flex w-72 max-w-[84vw] flex-col p-0">
          <Marca />
          <Menu_ onNavigate={() => setMenuMovil(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between gap-3 border-b border-border bg-card px-4 md:px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMenuMovil(true)}
              className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="h-[18px] w-[18px]" />
            </button>
            <span className="text-[13px] font-medium text-muted-foreground">
              <ShoppingCart className="mr-1 inline h-4 w-4 align-[-3px]" /> Adquisiciones <span className="mx-1 text-border">/</span>
              <span className="font-bold text-foreground">{titulo}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {puedeSolicitar && location.pathname !== RUTA.nueva && (
              <Button asChild size="sm" className="mr-1">
                <Link to={RUTA.nueva}>
                  <Plus className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Nueva solicitud</span>
                </Link>
              </Button>
            )}
            <button
              onClick={toggleMode}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Cambiar tema"
            >
              {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <button
              onClick={() => setCambiarClave(true)}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Cambiar contraseña"
              title={`Cambiar contraseña (${user?.email ?? ''})`}
            >
              <KeyRound className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={() => signOut()}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>
        <main className="flex-1 bg-background p-4 md:p-6">
          <Outlet />
        </main>
      </div>
      <ChangePasswordDialog open={cambiarClave} onOpenChange={setCambiarClave} />
      <Toaster />
    </div>
  )
}
