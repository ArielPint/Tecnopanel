import { useState } from 'react'
import isologo from '@/modules/financiero/assets/tecnopanel-isologo-color.png'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ArrowLeft,
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Wallet,
  TrendingUp,
  Users,
  Banknote,
  History,
  LogOut,
  Menu,
} from 'lucide-react'
import { useAuth, type FinancieroTab } from '@/modules/financiero/hooks/useAuth'
import { Button } from '@/modules/financiero/components/ui/button'
import { Avatar, AvatarFallback } from '@/modules/financiero/components/ui/avatar'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/modules/financiero/components/ui/sheet'
import { Separator } from '@/modules/financiero/components/ui/separator'
import PortalShell from '@/modules/financiero/components/PortalShell'
import { useProyectoActual } from '@/hooks/useProyectoActual'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  segment: string
  label: string
  icon: typeof LayoutDashboard
  tab: FinancieroTab
  end?: boolean
  // Color fijo del ícono (independiente del estado activo), igual a la
  // convención de dashboard.html: cada ítem del sidebar tiene un color propio.
  iconColorClase: string
}

// Rutas relativas al proyecto activo (resuelven contra /proyectos/:proyectoSlug/financiero,
// cualquiera sea el proyecto — antes hardcodeadas a /proyectos/la-chacra/financiero).
const NAV_ITEMS: NavItem[] = [
  { to: '.', segment: '', label: 'Dashboard', icon: LayoutDashboard, tab: 'dashboard', end: true, iconColorClase: 'text-primary' },
  { to: 'ordenes-compra', segment: 'ordenes-compra', label: 'Órdenes de Compra', icon: ShoppingCart, tab: 'ordenes-compra', iconColorClase: 'text-warning' },
  { to: 'facturas', segment: 'facturas', label: 'Facturas', icon: Receipt, tab: 'facturas', iconColorClase: 'text-cyan' },
  { to: 'presupuestos', segment: 'presupuestos', label: 'Presupuestos', icon: Wallet, tab: 'presupuestos', iconColorClase: 'text-purple' },
  { to: 'forecast', segment: 'forecast', label: 'Forecast', icon: TrendingUp, tab: 'forecast', iconColorClase: 'text-pink' },
  { to: 'remuneraciones', segment: 'remuneraciones', label: 'Remuneraciones', icon: Users, tab: 'remuneraciones', iconColorClase: 'text-warning' },
  { to: 'ingresos', segment: 'ingresos', label: 'Ingreso del Proyecto', icon: TrendingUp, tab: 'ingresos', iconColorClase: 'text-success' },
  { to: 'gastos-directos', segment: 'gastos-directos', label: 'Gastos Directos', icon: Banknote, tab: 'gastos-directos', iconColorClase: 'text-warning' },
  { to: 'auditoria', segment: 'auditoria', label: 'Auditoría', icon: History, tab: 'auditoria', iconColorClase: 'text-muted-foreground' },
]

function iniciales(nombre: string | undefined) {
  if (!nombre) return '?'
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

function SidebarNav({ puedeVer, onNavigate }: { puedeVer: (tab: FinancieroTab) => boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV_ITEMS.filter((item) => puedeVer(item.tab)).map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('size-4 shrink-0', !isActive && item.iconColorClase)} />
                {item.label}
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

function SidebarFooter({ nombre, rol, onSignOut }: { nombre?: string; rol?: string; onSignOut: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3">
      <Avatar className="size-8">
        <AvatarFallback className="text-xs">{iniciales(nombre)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-sidebar-foreground">{nombre}</p>
        <p className="truncate text-xs text-sidebar-foreground/60 capitalize">{rol}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={onSignOut} title="Salir" className="text-sidebar-foreground/70">
        <LogOut className="size-4" />
      </Button>
    </div>
  )
}

export default function FinancieroLayout() {
  const { perfil, puedeVer, signOut } = useAuth()
  const { nombre, slug } = useProyectoActual()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)
  const ultimoSegmento = location.pathname.split('/').filter(Boolean).pop() ?? ''
  const tituloPagina = NAV_ITEMS.find((item) => item.segment === ultimoSegmento)?.label ?? 'Dashboard'

  return (
    <PortalShell actual="financiero" hideAside>
    <div className="flex flex-1">
      {/* Sidebar — visible desde md hacia arriba, ocultable con el botón de menú */}
      <aside
        className={cn(
          'hidden w-64 shrink-0 flex-col border-r bg-sidebar py-4',
          !desktopCollapsed && 'md:flex',
        )}
      >
        <div className="mb-2 flex items-center gap-2 px-4">
          <img src={isologo} alt="" className="size-7 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold tracking-wide text-sidebar-foreground/50 uppercase">{nombre}</p>
            <p className="text-lg font-bold text-sidebar-foreground">Financiero</p>
          </div>
        </div>
        <Link
          to={`/proyectos/${slug}/dashboard`}
          className="mx-3 mb-2 flex items-center gap-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground"
        >
          <ArrowLeft className="size-3.5" /> Volver al proyecto
        </Link>
        <SidebarNav puedeVer={puedeVer} />
        <div className="mt-auto pt-4">
          <Separator className="mb-4 bg-sidebar-border" />
          <SidebarFooter nombre={perfil?.name} rol={perfil?.role} onSignOut={signOut} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar — siempre visible; el botón de menú solo aparece en mobile */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            onClick={() => setDesktopCollapsed((v) => !v)}
            title={desktopCollapsed ? 'Mostrar menú' : 'Ocultar menú'}
          >
            <Menu className="size-5" />
          </Button>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0">
              <SheetTitle className="sr-only">Menú</SheetTitle>
              <div className="flex h-full flex-col py-4">
                <div className="mb-2 flex items-center gap-2 px-4">
                  <img src={isologo} alt="" className="size-7 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold tracking-wide text-sidebar-foreground/50 uppercase">
                      {nombre}
                    </p>
                    <p className="text-lg font-bold text-sidebar-foreground">Financiero</p>
                  </div>
                </div>
                <Link
                  to={`/proyectos/${slug}/dashboard`}
                  onClick={() => setMobileOpen(false)}
                  className="mx-3 mb-2 flex items-center gap-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground"
                >
                  <ArrowLeft className="size-3.5" /> Volver al proyecto
                </Link>
                <SidebarNav puedeVer={puedeVer} onNavigate={() => setMobileOpen(false)} />
                <div className="mt-auto pt-4">
                  <Separator className="mb-4 bg-sidebar-border" />
                  <SidebarFooter nombre={perfil?.name} rol={perfil?.role} onSignOut={signOut} />
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <h1 className="text-base font-semibold">{tituloPagina}</h1>
        </header>

        <main className="min-w-0 flex-1 overflow-x-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
    </PortalShell>
  )
}
