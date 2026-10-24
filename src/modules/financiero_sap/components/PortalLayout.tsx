import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowLeft, BarChart3, FileSpreadsheet, KeyRound, Landmark, ListTree, LogOut, ReceiptText, Menu, Moon, Percent, Receipt, Scale, Sun, Tags } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { useOtrosPortales } from '@/hooks/useOtrosPortales'
import ChangePasswordDialog from '@/components/ChangePasswordDialog'
import { TecnopanelMark } from '@/components/TecnopanelLogo'
import { Sheet, SheetContent } from '@/modules/financiero/components/ui/sheet'
import { Toaster } from '@/modules/financiero/components/ui/sonner'
import { cn } from '@/lib/utils'
import { RUTA } from '../lib/rutas'
import { usePermisosFin } from '../hooks/usePermisosFin'
import { FiltrosProvider } from './Filtros'

// Contenedor del portal Financiero: mismo esquema que Adquisiciones (menú propio, login propio), con
// los tokens del hub para que el modo claro y el oscuro funcionen igual.

function Menu_({ onNavigate }: { onNavigate?: () => void }) {
  const { veEerr, veVentas, veBalance, configurar, rendiciones } = usePermisosFin()
  const { conHub, portales } = useOtrosPortales({ tipo: 'financiero' })
  const items = [
    ...(veEerr ? [{ to: RUTA.inicio, label: 'Estado de resultados', icon: FileSpreadsheet, end: true }] : []),
    ...(veEerr ? [{ to: RUTA.lineas, label: 'Por línea de negocio', icon: BarChart3, end: true }] : []),
    ...(veVentas ? [{ to: RUTA.ventas, label: 'Ventas', icon: Receipt, end: true }] : []),
    ...(veBalance ? [{ to: RUTA.balance, label: 'Balance general', icon: Scale, end: true }] : []),
    ...(veBalance ? [{ to: RUTA.ifrs, label: 'Situación financiera IFRS', icon: ListTree, end: true }] : []),
    ...(veBalance ? [{ to: RUTA.clasificacion, label: 'Clasificación IFRS', icon: Tags, end: true }] : []),
    ...(rendiciones ? [{ to: RUTA.rendiciones, label: 'Rendiciones', icon: ReceiptText, end: false }] : []),
    ...(veEerr || configurar ? [{ to: RUTA.prorrateo, label: 'Prorrateo de administración', icon: Percent, end: true }] : []),
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
        <p className="text-sm font-extrabold">Financiero</p>
        <p className="text-[11px] text-muted-foreground">Contabilidad SAP por línea</p>
      </div>
    </div>
  )
}

const TITULOS: Record<string, string> = {
  [RUTA.inicio]: 'Estado de resultados',
  [RUTA.lineas]: 'Por línea de negocio',
  [RUTA.ventas]: 'Ventas',
  [RUTA.prorrateo]: 'Prorrateo de administración',
  [RUTA.balance]: 'Balance general',
  [RUTA.ifrs]: 'Estado de situación financiera IFRS',
  [RUTA.clasificacion]: 'Clasificación IFRS',
  [RUTA.rendiciones]: 'Rendiciones',
  [RUTA.rendicionesCuentas]: 'Rendiciones · Tabla de cuentas',
}

export default function PortalLayout() {
  const { user, signOut } = useAuthStore()
  const mode = useThemeStore((s) => s.mode)
  const toggleMode = useThemeStore((s) => s.toggleMode)
  const location = useLocation()
  const [menuMovil, setMenuMovil] = useState(false)
  const [cambiarClave, setCambiarClave] = useState(false)
  const isDark = mode === 'dark'

  const ruta = location.pathname.replace(/\/$/, '')
  const titulo = TITULOS[ruta] ?? (ruta.startsWith(`${RUTA.rendiciones}/`) ? 'Rendiciones · Detalle' : '')

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
              <Landmark className="mr-1 inline h-4 w-4 align-[-3px]" /> Financiero <span className="mx-1 text-border">/</span>
              <span className="font-bold text-foreground">{titulo}</span>
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
        <main className="min-w-0 flex-1 bg-background p-4 md:p-6">
          <FiltrosProvider>
            <Outlet />
          </FiltrosProvider>
        </main>
      </div>
      <ChangePasswordDialog open={cambiarClave} onOpenChange={setCambiarClave} />
      <Toaster />
    </div>
  )
}
