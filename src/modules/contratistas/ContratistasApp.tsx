import { createContext, useContext, useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { FileCheck2, KeyRound, LogOut, Moon, Receipt, Sun, Users } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import ChangePasswordDialog from '@/components/ChangePasswordDialog'
import { TecnopanelMark } from '@/components/TecnopanelLogo'
import { Toaster } from '@/modules/financiero/components/ui/sonner'
import { cn } from '@/lib/utils'
import type { Empresa } from '@/modules/personal/lib/api'
import type { Empresa as EmpresaSso } from '@/modules/sso/lib/tiposTrabajadores'
import { miEmpresa, miEmpresaSso } from './lib/api'
import MiMes from './pages/MiMes'
import MisTrabajadores from './pages/MisTrabajadores'
import MisEstadosPago from './pages/MisEstadosPago'

// Portal Contratistas (/contratistas): la cuenta de una empresa contratista (enlazada en Usuarios a su
// empresa de Estados de Pago) sube su documentación mensual, confirma su listado, mantiene sus
// trabajadores y emite los estados de pago de sus subcontratos, por proyecto. Solo ve lo suyo: lo asegura la base. El acceso lo controla ProtectedRoute en App.tsx.

interface EmpresaActual {
  empresa: Empresa
  /** su fila en Prevención; null si todavía no está enlazada */
  sso: EmpresaSso | null
}

const Ctx = createContext<EmpresaActual | null>(null)

/** La empresa de la cuenta conectada (las páginas del portal solo se muestran si existe). */
export function useEmpresa(): EmpresaActual {
  const v = useContext(Ctx)
  if (!v) throw new Error('useEmpresa fuera del portal de contratistas')
  return v
}

function Layout() {
  const { user, signOut } = useAuthStore()
  const mode = useThemeStore((s) => s.mode)
  const toggleMode = useThemeStore((s) => s.toggleMode)
  const [actual, setActual] = useState<EmpresaActual | null | 'cargando'>('cargando')
  const [cambiarClave, setCambiarClave] = useState(false)

  useEffect(() => {
    miEmpresa()
      .then(async (empresa) => setActual(empresa ? { empresa, sso: await miEmpresaSso(empresa.id) } : null))
      .catch(() => setActual(null))
  }, [])

  const items = [
    { to: '/contratistas', label: 'Documentación del mes', icon: FileCheck2, end: true },
    { to: '/contratistas/trabajadores', label: 'Trabajadores', icon: Users, end: false },
    { to: '/contratistas/estados-pago', label: 'Estados de pago', icon: Receipt, end: false },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex h-[60px] max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <TecnopanelMark size={28} className="shrink-0" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-extrabold">{actual && actual !== 'cargando' ? actual.empresa.nombre : 'Portal Contratistas'}</p>
              <p className="text-[11px] text-muted-foreground">Portal Contratistas · Tecnopanel</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleMode}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Cambiar tema"
            >
              {mode === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <button
              onClick={() => setCambiarClave(true)}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Cambiar contraseña"
              title={`Cambiar contraseña (${user?.email ?? ''})`}
            >
              <KeyRound className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={() => signOut()}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors',
                  isActive ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground',
                )
              }
            >
              <it.icon className="h-4 w-4" />
              {it.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl p-4 md:p-6">
        {actual === 'cargando' ? (
          <div className="h-40 animate-pulse rounded bg-muted" />
        ) : !actual ? (
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Esta cuenta no está enlazada a una empresa contratista. Pide a Tecnopanel que la enlace en Usuarios.
          </p>
        ) : (
          <Ctx.Provider value={actual}>
            <Outlet />
          </Ctx.Provider>
        )}
      </main>
      <ChangePasswordDialog open={cambiarClave} onOpenChange={setCambiarClave} />
      <Toaster />
    </div>
  )
}

export default function ContratistasApp() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<MiMes />} />
        <Route path="trabajadores" element={<MisTrabajadores />} />
        <Route path="estados-pago" element={<MisEstadosPago />} />
        <Route path="*" element={<Navigate to="/contratistas" replace />} />
      </Route>
    </Routes>
  )
}
