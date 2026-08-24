import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'

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

export default function NotificationsBell() {
  const { perfil } = useAuth()
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  async function load() {
    if (!perfil?.id) return
    const { data, error } = await supabase
      .from('solicitudes_notificaciones')
      .select('id, tipo, titulo, mensaje, leida, created_at')
      .eq('user_id', perfil.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) return
    setNotifs((data as Notif[]) ?? [])
  }

  useEffect(() => {
    load()
  }, [perfil?.id])

  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOut)
    return () => document.removeEventListener('mousedown', onClickOut)
  }, [])

  async function markAllRead() {
    if (!perfil?.id) return
    const { error } = await supabase.from('solicitudes_notificaciones').update({ leida: true }).eq('user_id', perfil.id).eq('leida', false)
    if (error) return
    setNotifs((n) => n.map((x) => ({ ...x, leida: true })))
  }

  function toggle() {
    setOpen((o) => !o)
    if (!open) load()
  }

  const unread = notifs.filter((n) => !n.leida).length

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={toggle} className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Notificaciones">
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] leading-none font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border bg-popover shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Notificaciones</h3>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <CheckCheck size={12} /> Marcar leídas
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="py-8 text-center">
                <Bell size={24} className="mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Sin notificaciones</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifs.map((n) => (
                  <div key={n.id} className={`flex gap-3 px-4 py-3 ${!n.leida ? 'bg-primary/5' : ''}`}>
                    <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm">📋</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-snug font-medium">{n.titulo}</p>
                      {n.mensaje && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{n.mensaje}</p>}
                      <p className="mt-1 text-[10px] text-muted-foreground/70">{tiempoRelativo(n.created_at)}</p>
                    </div>
                    {!n.leida && <div className="mt-2 size-2 shrink-0 rounded-full bg-destructive" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
