import { NavLink, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import TecnopanelLogo from './TecnopanelLogo'
import { IconBriefcase, IconBuilding, IconDashboard, IconMoon, IconSun, IconUsers } from './icons'

// Estructura del sidebar agrupada en secciones, igual que en La Chacra:
// PRINCIPAL (los proyectos/obras de Tecnopanel) y GESTIÓN (sistemas internos
// de la empresa — CRM, y a futuro Financiero, etc. — que NO son proyectos).
const navSections = [
  {
    label: 'Principal',
    items: [
      { to: '/', label: 'Dashboard', end: true, icon: IconDashboard },
      { to: '/proyectos', label: 'Proyectos', end: false, icon: IconBuilding },
    ],
  },
  {
    label: 'Gestión',
    items: [{ to: '/crm', label: 'CRM', end: false, icon: IconBriefcase }],
  },
  {
    label: 'Sistema',
    items: [{ to: '/usuarios', label: 'Usuarios', end: false, icon: IconUsers }],
  },
]

const navLinkBase =
  'flex items-center gap-3 rounded-md border-l-[3px] px-3 py-2 text-sm font-medium transition-colors'
const navLinkActive = 'border-tecnopanel bg-tecnopanel/10 text-tecnopanel dark:bg-tecnopanel/15 dark:text-white'
const navLinkInactive =
  'border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white'

export default function Layout() {
  const { user, signOut } = useAuthStore()
  const mode = useThemeStore((s) => s.mode)
  const toggleMode = useThemeStore((s) => s.toggleMode)
  const isDark = mode === 'dark'

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 flex flex-col bg-white text-gray-800 border-r border-gray-200 dark:bg-tecnopanel-dark dark:text-white dark:border-white/10">
        <div className="px-5 py-6 border-b border-gray-200 dark:border-white/10">
          <TecnopanelLogo variant={isDark ? 'dark' : 'light'} />
        </div>
        <nav className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label}>
              <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/40">
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `${navLinkBase} ${isActive ? navLinkActive : navLinkInactive}`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon
                            className={isActive ? 'text-tecnopanel' : 'text-gray-400 dark:text-white/40'}
                          />
                          {item.label}
                        </>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-gray-200 dark:border-white/10">
          <button
            onClick={toggleMode}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white transition-colors"
          >
            {isDark ? (
              <IconSun className="text-gray-400 dark:text-white/40" />
            ) : (
              <IconMoon className="text-gray-400 dark:text-white/40" />
            )}
            {isDark ? 'Modo claro' : 'Modo oscuro'}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b bg-white dark:bg-neutral-900 dark:border-white/10 flex items-center justify-between px-6">
          <span className="text-sm text-gray-500 dark:text-white/50">
            Dashboard empresarial — La Chacra + CRM
          </span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-700 dark:text-white/70">{user?.email}</span>
            <button
              onClick={() => signOut()}
              className="rounded-md border px-3 py-1.5 text-gray-600 hover:bg-gray-50 hover:text-tecnopanel dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5 transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        </header>
        <main className="flex-1 p-6 bg-gray-50 dark:bg-neutral-900">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
