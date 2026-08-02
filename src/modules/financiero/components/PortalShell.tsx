import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react'
import isologo from '@/modules/financiero/assets/tecnopanel-isologo-color.png'
import { Button } from '@/modules/financiero/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/modules/financiero/components/ui/sheet'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'
import { useProyectoActual } from '@/hooks/useProyectoActual'
import { useThemeStore } from '@/store/themeStore'
import { cn } from '@/lib/utils'

// Sidebar del portal de proyecto — hasta ahora cada módulo (Financiero/Planta/
// Logística/Solicitudes/Settings/Estados de Pago) era una app aislada sin
// ningún link hacia las demás, solo alcanzable tipeando la URL. Un componente
// compartido en vez de repetirlo en cada Layout. Fase F: genérico por slug de
// proyecto en vez de hardcodeado a La Chacra.
const ITEMS = [
  { key: 'dashboard', label: 'Principal' },
  { key: 'produccion', label: 'Producción' },
  { key: 'logistica', label: 'Logística' },
  { key: 'solicitudes', label: 'Solicitudes' },
  { key: 'financiero', label: 'Financiero' },
  { key: 'estados_pago', label: 'Estados de Pago' },
] as const

type ModuloKey = (typeof ITEMS)[number]['key'] | 'settings'

function ItemLink({ to, label, activo, onNavigate }: { to: string; label: string; activo: boolean; onNavigate?: () => void }) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={cn(
        'rounded-md border-l-2 px-3 py-2 text-sm font-medium transition-colors',
        activo
          ? 'border-brand bg-brand/10 text-brand'
          : 'border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
      )}
    >
      {label}
    </Link>
  )
}

const COLLAPSE_KEY = 'tecnopanel-hub-portal-sidebar-collapsed'

export default function PortalShell({ actual, children }: { actual: ModuloKey; children: ReactNode }) {
  const { proyectoSlug = '' } = useParams<{ proyectoSlug: string }>()
  const acceso = usePermisosProyecto(proyectoSlug)
  const { nombre } = useProyectoActual()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')
  const [mobileOpen, setMobileOpen] = useState(false)
  const mode = useThemeStore((s) => s.mode)
  const toggleMode = useThemeStore((s) => s.toggleMode)

  if (acceso.loading) {
    return <div className="flex min-h-svh items-center justify-center text-muted-foreground">Cargando…</div>
  }

  function toggleCollapsed() {
    setCollapsed((v) => {
      localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1')
      return !v
    })
  }

  const base = `/proyectos/${proyectoSlug}`
  const visibles = ITEMS.filter((it) => acceso.tieneAccion(it.key))
  const rutaDe = (key: (typeof ITEMS)[number]['key']) =>
    `${base}/${key === 'dashboard' ? 'dashboard' : key === 'estados_pago' ? 'estados-pago' : key}`

  const navContent = (onNavigate?: () => void) => (
    <>
      <div className="mb-4 flex items-center gap-2 px-4">
        <img src={isologo} alt="" className="size-7 shrink-0" />
        <p className="min-w-0 truncate text-xs font-semibold tracking-wide text-sidebar-foreground/50 uppercase">{nombre}</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {visibles.map((it) => (
          <ItemLink key={it.key} to={rutaDe(it.key)} label={it.label} activo={actual === it.key} onNavigate={onNavigate} />
        ))}
        {acceso.isAdmin && (
          <ItemLink to={`${base}/settings`} label="Configuración" activo={actual === 'settings'} onNavigate={onNavigate} />
        )}
      </nav>
      <div className="flex flex-col gap-1 px-3">
        <Link to="/" className="text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground" onClick={onNavigate}>
          ← Volver al Hub
        </Link>
        <Link to="/proyectos" className="text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground" onClick={onNavigate}>
          ← Volver a Proyectos
        </Link>
      </div>
    </>
  )

  return (
    <div className="flex min-h-svh">
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r bg-sidebar py-4 md:flex',
          collapsed ? 'md:w-0 md:overflow-hidden md:border-r-0 md:py-0' : 'w-56',
        )}
      >
        {!collapsed && navContent()}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b bg-background px-3 py-2 md:px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-56 bg-sidebar p-0">
              <SheetTitle className="sr-only">Menú del proyecto</SheetTitle>
              <div className="flex h-full flex-col py-4">{navContent(() => setMobileOpen(false))}</div>
            </SheetContent>
          </Sheet>
          <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={toggleCollapsed} title={collapsed ? 'Mostrar menú del proyecto' : 'Ocultar menú del proyecto'}>
            {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          </Button>
          <p className="truncate text-xs font-medium text-muted-foreground md:hidden">{nombre}</p>
          <Button variant="ghost" size="icon" className="ml-auto" onClick={toggleMode} aria-label="Cambiar tema">
            {mode === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
        </div>
        <div className="flex min-h-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
