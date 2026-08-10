import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export interface MensajeItem {
  id: string
  mensaje: string
  fecha: string
  oportunidad: string
  usuario: string
}

interface Estado {
  mensajes: MensajeItem[]
  loading: boolean
  error: string | null
}

const LIMITE = 50

// v1 de Comunicaciones (§3.6.5): agregador de solo lectura de mensajes_oportunidad, sin
// selector de contexto (100% CRM, sin equivalente de proyecto/obra) — cero migración.
export function useComunicaciones(activo: boolean): Estado {
  const [estado, setEstado] = useState<Estado>({ mensajes: [], loading: false, error: null })

  useEffect(() => {
    if (!activo) {
      setEstado({ mensajes: [], loading: false, error: null })
      return
    }
    let cancelado = false
    setEstado((s) => ({ ...s, loading: true, error: null }))
    supabase
      .from('mensajes_oportunidad')
      .select('id, mensaje, created_at, oportunidad:oportunidades(codigo, nombre), usuario:profiles(nombre, apellido)')
      .order('created_at', { ascending: false })
      .limit(LIMITE)
      .then(({ data, error }) => {
        if (cancelado) return
        if (error) {
          setEstado({ mensajes: [], loading: false, error: error.message })
          return
        }
        const mensajes: MensajeItem[] = (data ?? []).map((m) => {
          const opp = (Array.isArray(m.oportunidad) ? m.oportunidad[0] : m.oportunidad) as { codigo: string; nombre: string } | null
          const usr = (Array.isArray(m.usuario) ? m.usuario[0] : m.usuario) as { nombre: string; apellido: string | null } | null
          return {
            id: m.id,
            mensaje: m.mensaje,
            fecha: m.created_at,
            oportunidad: opp ? `${opp.codigo} — ${opp.nombre}` : 'Oportunidad',
            usuario: usr ? `${usr.nombre} ${usr.apellido ?? ''}`.trim() : 'Usuario',
          }
        })
        setEstado({ mensajes, loading: false, error: null })
      })
    return () => {
      cancelado = true
    }
  }, [activo])

  return estado
}
