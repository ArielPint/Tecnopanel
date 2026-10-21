import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowLeft, Building2, ClipboardList, KeyRound, LogOut, Menu, Moon, Plus, Settings, Sun, UserPlus } from 'lucide-react'
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
import { usePermisosIngreso } from '../hooks/usePermisosIngreso'
import { useAlertaContratistas } from '../hooks/useAlertaContratistas'

// Contenedor del portal Ingreso de Personal: mismo esquema que el de Prevención (menú propio,
// login propio), con los tokens del hub para que el modo claro y el oscuro funcionen igual.

function Menu_({ onNavigate }: { onNavigate?: () => void }) {
  const { puedeSolicitar, gestionaContratistas, tiene } = usePermisosIngreso()
  const { conHub, portales } = useOtrosPortales({ tipo: 'personal' })
  const atrasadas = useAlertaContratistas(gestionaContratistas)
  const items: { to: string; label: string; icon: typeof ClipboardList; end: boolean; aviso?: number }[] = [
    { to: RUTA.inicio, label: 'Ingresos', icon: ClipboardList, end: true },
    ...(puedeSolicitar ? [{ to: RUTA.nueva, label: 'Nueva solicitud', icon: Plus, end: true }] : []),
    ...(gestionaContratistas ? [{ to: RUTA.contratistas, label: 'Contratistas', icon: Building2, end: true, aviso: atrasadas }] : []),
    ...(tiene('rrhh') ? [{ to: RUTA.configuracion, label: 'Configuración', icon: Settings, end: true }] : []),
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
              {!!it.aviso && (
                <span
                  className="ml-auto rounded-full bg-destructive px-1.5 text-[11px] font-bold tabular-nums text-destructive-foreground"
                  title="Empresas con documentación del mes atrasada"
                >
                  {it.aviso}
                </span>
              )}
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
        <p className="text-sm font-extrabold">Ingreso de Personal</p>
        <p className="text-[11px] text-muted-foreground">Solicitudes y seguimiento</p>
      </div>
    </div>
  )
}

export default function PortalLayout() {
  const { user, signOut } = useAuthStore()
  const mode = useThemeStore((s) => s.mode)
  const toggleMode = useThemeStore((s) => s.toggleMode)
  const { puedeSolicitar } = usePermisosIngreso()
  const location = useLocation()
  const [menuMovil, setMenuMovil] = useState(false)
  const [cambiarClave, setCambiarClave] = useState(false)
  const isDark = mode === 'dark'

  const titulo =
    location.pathname === RUTA.nueva
      ? 'Nueva solicitud'
      : location.pathname === RUTA.configuracion
        ? 'Configuración'
        : location.pathname === RUTA.contratistas
          ? 'Contratistas'
        : location.pathname === RUTA.inicio
          ? 'Ingresos'
          : 'Detalle'

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
              <UserPlus className="mr-1 inline h-4 w-4 align-[-3px]" /> Ingreso de Personal <span className="mx-1 text-border">/</span>
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
