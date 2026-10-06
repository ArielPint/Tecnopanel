import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { SIP_ANCLA_ID } from '@/lib/proyectoIds'
import { useAuthStore } from '@/store/authStore'
import { useAccesoUsuario } from '@/hooks/useAccesoUsuario'
import type { AccionSip, ModuloSip } from '../lib/accesos'

/** Acciones del usuario en el portal, para mostrar u ocultar menús y botones. La RLS es la que
 *  manda de verdad; esto solo evita ofrecer lo que la base va a rechazar.
 *  Con `modulo`, `puede(accion)` pregunta por ese módulo. */
export function usePermisosSip(modulo?: ModuloSip) {
  const userId = useAuthStore((s) => s.user?.id)
  const { isAdmin, isSuperAdmin, loading: accesoLoading } = useAccesoUsuario()
  const [claves, setClaves] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelado = false
    supabase
      .from('permisos')
      .select('modulo_key, accion')
      .eq('user_id', userId)
      .eq('proyecto_id', SIP_ANCLA_ID)
      .like('modulo_key', 'pnl:%')
      .then(({ data }) => {
        if (cancelado) return
        setClaves(new Set((data ?? []).map((p) => `${p.modulo_key.slice(4)}:${p.accion}`)))
        setLoading(false)
      })
    return () => {
      cancelado = true
    }
  }, [userId])

  // Mismo criterio que pnl_usuario_puede_modulo(): los admin del portal pueden todo.
  const esAdmin = isAdmin || isSuperAdmin
  const puedeEn = useCallback((m: ModuloSip, accion: AccionSip = 'ver') => esAdmin || claves.has(`${m}:${accion}`), [esAdmin, claves])
  const puede = useCallback((accion: AccionSip) => (modulo ? puedeEn(modulo, accion) : false), [modulo, puedeEn])

  return { userId: userId ?? '', puede, puedeEn, esAdmin, loading: loading || accesoLoading }
}
