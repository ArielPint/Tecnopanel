import { useEffect } from 'react'
import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { SUCURSALES, type Sucursal } from '@/lib/lineasNegocio'
import { useAuthStore } from '@/store/authStore'
import type { FiltroSucursal } from '../lib/api'

// Sucursal que se está mirando en el portal (Santiago, Puerto Varas o las dos). Mismo criterio que
// has_sucursal() en la base: quien tiene sucursal propia y no ve todas (ve_todas_sucursales) queda
// fijo en la suya; los demás eligen, y la elección se recuerda en este navegador.

const CLAVE = 'tecnopanel-sip-sucursal'

function leerElegida(): FiltroSucursal {
  try {
    const v = window.localStorage.getItem(CLAVE)
    return (SUCURSALES as readonly string[]).includes(v ?? '') ? (v as Sucursal) : 'todas'
  } catch {
    return 'todas'
  }
}

interface EstadoSucursal {
  elegida: FiltroSucursal
  /** sucursal propia del usuario, si no ve todas */
  fija: Sucursal | null
  cargadaPara: string | null
  elegir: (s: FiltroSucursal) => void
  cargar: (userId: string) => Promise<void>
}

const useEstado = create<EstadoSucursal>((set) => ({
  elegida: leerElegida(),
  fija: null,
  cargadaPara: null,
  elegir: (s) => {
    try {
      window.localStorage.setItem(CLAVE, s)
    } catch {
      // sin almacenamiento: la elección dura lo que la pestaña
    }
    set({ elegida: s })
  },
  cargar: async (userId) => {
    const [mia, todas] = await Promise.all([supabase.rpc('mi_sucursal'), supabase.rpc('ve_todas_sucursales')])
    const propia = (SUCURSALES as readonly string[]).includes(mia.data ?? '') ? (mia.data as Sucursal) : null
    set({ fija: todas.data === true ? null : propia, cargadaPara: userId })
  },
}))

export function useSucursalSip() {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const { elegida, fija, cargadaPara, elegir, cargar } = useEstado()

  useEffect(() => {
    if (userId && cargadaPara !== userId) cargar(userId)
  }, [userId, cargadaPara, cargar])

  const sucursal: FiltroSucursal = fija ?? elegida
  return {
    /** lo que filtran los listados */
    sucursal,
    /** sucursal propia del usuario cuando no puede ver la otra */
    fija,
    elegir,
    /** sugerida al registrar: la que se está mirando, si es una sola */
    porDefecto: sucursal === 'todas' ? null : sucursal,
    loading: !!userId && cargadaPara !== userId,
  }
}
