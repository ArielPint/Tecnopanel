import { useEffect, useState, useRef } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/modules/crm/contexts/AuthContext'
import { handleSupabaseError } from '@/modules/crm/lib/errors'

interface Notif {
  id: string
  tipo: string
  titulo: string
  mensaje: string | null
  leida: boolean
  created_at: string
}

function tiempoRelativo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ayer'
  return `hace ${d}d`
}

const TIPO_LABEL: Record<string, { icon: string; color: string }> = {
  oportunidad_nueva: { icon: '📋', color: '#3b82f6' },
  etapa_cambio:      { icon: '→',   color: '#f59e0b' },
  asignacion:        { icon: '👤',  color: '#8b5cf6' },
  estado_final:      { icon: '✓',   color: '#22c55e' },
}

export default function NotificationsBell() {
  const { profile } = useAuth()
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  async function load() {
    if (!profile?.id) return
    const { data, error } = await supabase
      .from('notifications')
      .select('id,tipo,titulo,mensaje,leida,created_at')
      .order('created_at', { ascending: false })
      .limit(20)
    handleSupabaseError(error, 'NotificationsBell.load')
    setNotifs((data as Notif[]) ?? [])
  }

  useEffect(() => { load() }, [profile?.id])

  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOut)
    return () => document.removeEventListener('mousedown', onClickOut)
  }, [])

  async function markAllRead() {
    if (!profile?.id) return
    const { error } = await supabase.from('notifications').update({ leida: true }).eq('leida', false)
    if (handleSupabaseError(error, 'NotificationsBell.markAllRead')) return
    setNotifs(n => n.map(x => ({ ...x, leida: true })))
  }

  function toggle() {
    setOpen(o => !o)
    if (!open) load()
  }

  const unread = notifs.filter(n => !n.leida).length

  return (
    <div ref={ref} className="relative">
      <button onClick={toggle}
        className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-crm-red text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Notificaciones</h3>
            {unread > 0 && (
              <button onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-crm-red hover:underline">
                <CheckCheck size={12} /> Marcar leídas
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="text-center py-8">
                <Bell size={24} className="mx-auto mb-2 text-gray-200" />
                <p className="text-sm text-gray-400">Sin notificaciones</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {notifs.map(n => {
                  const meta = TIPO_LABEL[n.tipo] ?? { icon: '📌', color: '#64748b' }
                  return (
                    <div key={n.id} className={`flex gap-3 px-4 py-3 ${!n.leida ? 'bg-red-50/30' : ''}`}>
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
                        {meta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 leading-snug">{n.titulo}</p>
                        {n.mensaje && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{n.mensaje}</p>}
                        <p className="text-[10px] text-gray-300 mt-1">{tiempoRelativo(n.created_at)}</p>
                      </div>
                      {!n.leida && <div className="w-2 h-2 bg-crm-red rounded-full mt-2 flex-shrink-0" />}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
