import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { SSO_ANCLA_ID } from '@/lib/proyectoIds'
import { useAuthStore } from '@/store/authStore'
import { useAccesoUsuario } from '@/hooks/useAccesoUsuario'
import type { ModuloSso } from '../lib/accesos'
import type { AccionSso } from '../lib/tipos'

/** Acciones del usuario en el portal, para mostrar u ocultar menús y botones. La RLS y los
 *  triggers son los que mandan de verdad; esto solo evita ofrecer lo que la base va a rechazar.
 *  Con `modulo`, `puede(accion)` pregunta por ese módulo (así lo usan las pantallas de cada uno). */
export function usePermisosSso(modulo?: ModuloSso) {
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
      .eq('proyecto_id', SSO_ANCLA_ID)
      .like('modulo_key', 'sso:%')
      .then(({ data }) => {
        if (cancelado) return
        setClaves(new Set((data ?? []).map((p) => `${p.modulo_key.slice(4)}:${p.accion}`)))
        setLoading(false)
      })
    return () => {
      cancelado = true
    }
  }, [userId])

  // Mismo criterio que sso_usuario_puede_modulo(): los admin del portal pueden todo.
  const esAdmin = isAdmin || isSuperAdmin
  const puedeEn = useCallback(
    (m: ModuloSso, accion: AccionSso = 'ver') => esAdmin || claves.has(`${m}:${accion}`),
    [esAdmin, claves],
  )
  const puede = useCallback((accion: AccionSso) => (modulo ? puedeEn(modulo, accion) : false), [modulo, puedeEn])

  return { userId: userId ?? '', puede, puedeEn, esAdmin, loading: loading || accesoLoading }
}
