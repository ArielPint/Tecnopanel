import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import type { Oportunidad } from '@/modules/crm/types/database'
import OportunidadDrawer, { type Tab } from '@/modules/crm/components/OportunidadDrawer'
import { handleSupabaseError } from '@/modules/crm/lib/errors'

const TABS: Tab[] = ['general', 'etapa', 'docs', 'historial', 'chat']

// Enlace directo a una oportunidad (/crm/oportunidad/:id). Lo usan la campana de
// notificaciones y las tarjetas del dashboard. El control de acceso es el RLS de
// `oportunidades`: si el usuario no puede leer la fila, la consulta vuelve vacía y acá
// se muestra el aviso de sin acceso — no hay chequeo de permiso duplicado en el cliente.
export default function OportunidadLink() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [opp, setOpp] = useState<Oportunidad | null>(null)
  const [loading, setLoading] = useState(true)

  const tabParam = params.get('tab')
  const initialTab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'general'

  useEffect(() => {
    let cancelado = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('oportunidades')
        .select('*, cliente:clientes(razon_social,rut), vendedor:profiles(nombre,apellido)')
        .eq('id', id)
        .maybeSingle()
      handleSupabaseError(error, 'OportunidadLink.load')
      if (cancelado) return
      setOpp((data as Oportunidad) ?? null)
      setLoading(false)
    }
    if (id) load()
    return () => { cancelado = true }
  }, [id])

  function volver() {
    navigate('/crm/dashboard', { replace: true })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-crm-red border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!opp) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center max-w-md mx-auto">
          <p className="text-sm font-semibold text-gray-700">No se puede abrir la oportunidad</p>
          <p className="text-xs text-gray-500 mt-1.5">No existe o no tenés acceso a ella.</p>
          <button onClick={volver} className="mt-4 px-4 py-2 text-sm bg-crm-red text-white rounded-lg font-medium hover:bg-red-700">
            Volver al dashboard
          </button>
        </div>
      </div>
    )
  }

  return <OportunidadDrawer oportunidad={opp} initialTab={initialTab} onClose={volver} onUpdate={volver} />
}
