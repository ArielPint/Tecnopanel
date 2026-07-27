import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Briefcase,
  Building2,
  ChevronLeft,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Moon,
  Sun,
  Users,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { TecnopanelMark, TecnopanelWordmark } from './TecnopanelLogo'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Sheet, SheetContent } from './ui/sheet'
import { cn } from '@/lib/utils'

const navSections = [
  {
    label: 'Principal',
    items: [
      { to: '/', label: 'Dashboard', end: true, icon: LayoutDashboard },
      { to: '/proyectos', label: 'Proyectos', end: false, icon: Building2 },
    ],
  },
  {
    label: 'Gestión',
    items: [
      { to: '/crm', label: 'CRM', end: false, icon: Briefcase },
      { to: '/geovictoria', label: 'GeoVictoria', end: false, icon: MapPin },
    ],
  },
  {
    label: 'Sistema',
    items: [{ to: '/usuarios', label: 'Usuarios', end: false, icon: Users }],
  },
]

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/proyectos': 'Proyectos',
  '/crm': 'CRM',
  '/geovictoria': 'GeoVictoria',
  '/usuarios': 'Usuarios',
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {navSections.map((section) => (
        <div key={section.label}>
          <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {section.label}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-[13.5px] font-semibold transition-colors',
                    isActive
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                  )
                }
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

function SidebarHead({ collapsed = false, isDark = false }: { collapsed?: boolean; isDark?: boolean }) {
  return (
    <div
      className={cn(
        'flex h-[60px] shrink-0 items-center gap-2.5 border-b border-border px-4',
        collapsed && 'justify-center px-0'
      )}
    >
      <TecnopanelMark size={28} className="shrink-0" />
      {!collapsed && <TecnopanelWordmark variant={isDark ? 'dark' : 'light'} className="text-base" />}
    </div>
  )
}

export default function Layout() {
  const { user, signOut } = useAuthStore()
  const mode = useThemeStore((s) => s.mode)
  const toggleMode = useThemeStore((s) => s.toggleMode)
  const isDark = mode === 'dark'
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const initials = (user?.email ?? '?').slice(0, 2).toUpperCase()
  const pageTitle = pageTitles[location.pathname] ?? 'TecnoPanel'

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar desktop */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 md:flex',
          collapsed ? 'w-[76px]' : 'w-64'
        )}
      >
        <SidebarHead collapsed={collapsed} isDark={isDark} />
        {collapsed ? (
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {navSections.flatMap((s) => s.items).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center justify-center rounded-md p-2.5 transition-colors',
                    isActive ? 'bg-brand/10 text-brand' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )
                }
              >
                <item.icon className="h-[18px] w-[18px]" />
              </NavLink>
            ))}
          </nav>
        ) : (
          <NavList />
        )}
        <div className="border-t border-border p-3">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              collapsed && 'justify-center'
            )}
          >
            <ChevronLeft className={cn('h-[18px] w-[18px] shrink-0 transition-transform', collapsed && 'rotate-180')} />
            {!collapsed && 'Contraer'}
          </button>
        </div>
      </aside>

      {/* Sidebar mobile (Sheet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex w-72 max-w-[84vw] flex-col p-0">
          <SidebarHead isDark={isDark} />
          <NavList onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between gap-4 border-b border-border bg-card px-4 md:px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileOpen(true)}
              className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="h-[18px] w-[18px]" />
            </button>
            <span className="text-[13px] font-medium text-muted-foreground">
              TecnoPanel <span className="mx-1 text-border">/</span>{' '}
              <span className="font-bold text-foreground">{pageTitle}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleMode}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Cambiar tema"
            >
              {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <div className="mx-1 hidden items-center gap-2.5 rounded-full py-1 pl-1 pr-1 sm:flex">
              <Avatar className="h-7 w-7">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="max-w-[160px] truncate text-[12.5px] font-semibold">{user?.email}</span>
            </div>
            <button
              onClick={() => signOut()}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
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
    </div>
  )
}
