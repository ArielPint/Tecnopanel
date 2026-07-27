import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Plus, Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import HeaderSearch from '@/modules/crm/components/HeaderSearch'
import NotificationsBell from '@/modules/crm/components/NotificationsBell'
import NuevaOportunidadModal from '@/modules/crm/components/NuevaOportunidadModal'
import { useGlobalModals } from '@/modules/crm/contexts/GlobalModalsContext'

export function AppLayout() {
  const { showNuevaOpp, openNuevaOpp, closeNuevaOpp } = useGlobalModals()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3 flex-shrink-0 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg flex-shrink-0"
            aria-label="Abrir menú"
          >
            <Menu size={18} />
          </button>

          <HeaderSearch />

          <div className="flex items-center gap-2 ml-auto">
            <NotificationsBell />
            <button
              onClick={openNuevaOpp}
              className="flex items-center gap-1.5 bg-crm-red hover:bg-crm-dark text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Nueva Oportunidad</span>
              <span className="sm:hidden">Nueva</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <NuevaOportunidadModal
        isOpen={showNuevaOpp}
        onClose={closeNuevaOpp}
        onSuccess={closeNuevaOpp}
      />
    </div>
  )
}
