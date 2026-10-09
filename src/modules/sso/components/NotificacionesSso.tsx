import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCheck, HardHat } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { RUTA } from '../lib/rutas'

interface Notificacion {
  id: string
  hallazgo_id: string | null
  evento_id: string | null
  acuerdo_id: string | null
  ruta: string | null
  tipo: string
  titulo: string
  mensaje: string | null
  leida: boolean
  created_at: string
}

// El servidor propio no tiene Realtime: se consulta cada 2 minutos y al abrir el panel.
const INTERVALO_MS = 120_000

const COLOR_TIPO: Record<string, string> = {
  accidente_fatal: 'bg-black dark:bg-white',
  accidente_grave: 'bg-red-600',
  vencido: 'bg-red-600',
  vence_hoy: 'bg-red-500',
  por_vencer: 'bg-amber-500',
  rechazado: 'bg-amber-500',
  por_verificar: 'bg-blue-500',
  asignado: 'bg-slate-500',
  acuerdo_asignado: 'bg-slate-500',
  acuerdo_vencido: 'bg-red-600',
  diat_pendiente: 'bg-red-600',
  documento_vencido: 'bg-red-600',
  documento_por_vencer: 'bg-amber-500',
  resumen_vencimientos: 'bg-amber-500',
  comite: 'bg-amber-500',
  cerrado: 'bg-emerald-500',
}

function tiempoRelativo(fecha: string) {
  const min = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

/** Campana del portal de Prevención (y del header del hub). Mismo patrón que solicitudes/NotificationsBell. */
export default function NotificacionesSso() {
  const userId = useAuthStore((s) => s.user?.id)
  const navigate = useNavigate()
  const [items, setItems] = useState<Notificacion[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const cargar = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase
      .from('sso_notificaciones')
      .select('id, hallazgo_id, evento_id, acuerdo_id, ruta, tipo, titulo, mensaje, leida, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
    if (!error) setItems((data as Notificacion[]) ?? [])
  }, [userId])

  useEffect(() => {
    cargar()
    const t = window.setInterval(cargar, INTERVALO_MS)
    return () => window.clearInterval(t)
  }, [cargar])

  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  async function marcar(ids: string[]) {
    if (ids.length === 0) return
    const { error } = await supabase.from('sso_notificaciones').update({ leida: true }).in('id', ids)
    if (!error) setItems((xs) => xs.map((x) => (ids.includes(x.id) ? { ...x, leida: true } : x)))
  }

  async function abrir(n: Notificacion) {
    if (!n.leida) marcar([n.id])
    setOpen(false)
    if (n.hallazgo_id) navigate(RUTA.hallazgo(n.hallazgo_id))
    else if (n.evento_id) navigate(RUTA.evento(n.evento_id))
    else if (n.acuerdo_id) {
      // el acuerdo se ve en su reunión; si no tiene, en la pestaña Acuerdos
      const { data } = await supabase.from('sso_comite_acuerdos').select('reunion_id').eq('id', n.acuerdo_id).maybeSingle()
      navigate(data?.reunion_id ? RUTA.reunion(data.reunion_id) : RUTA.acuerdosComite)
    } else if (n.ruta?.startsWith('/prevencion')) navigate(n.ruta)
  }

  const sinLeer = items.filter((n) => !n.leida)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          if (!open) cargar()
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Avisos de Prevención de Riesgos"
        aria-label="Avisos de Prevención de Riesgos"
      >
        <HardHat className="h-[18px] w-[18px]" />
        {sinLeer.length > 0 && (
          <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold leading-none text-white">
            {sinLeer.length > 9 ? '9+' : sinLeer.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-popover shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Prevención de Riesgos</h3>
            {sinLeer.length > 0 && (
              <button type="button" onClick={() => marcar(sinLeer.map((n) => n.id))} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <CheckCheck size={12} /> Marcar leídas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sin avisos</p>
            ) : (
              <div className="divide-y">
                {items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => abrir(n)}
                    className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-muted', !n.leida && 'bg-primary/5')}
                  >
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', COLOR_TIPO[n.tipo] ?? 'bg-slate-400')} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-xs leading-snug', !n.leida && 'font-semibold')}>{n.titulo}</span>
                      {n.mensaje && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{n.mensaje}</span>}
                      <span className="mt-1 block text-[10px] text-muted-foreground/70">{tiempoRelativo(n.created_at)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
