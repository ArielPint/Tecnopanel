import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { ADQ_ANCLA_ID } from '@/lib/proyectoIds'
import { useAuthStore } from '@/store/authStore'
import { useAccesoUsuario } from '@/hooks/useAccesoUsuario'
import type { RolAdq } from '../lib/catalogos'

/** Roles del usuario en el portal, para mostrar u ocultar menús y botones. La RLS y las funciones
 *  adq_* son las que mandan de verdad; esto solo evita ofrecer lo que la base va a rechazar. */
export function usePermisosAdq() {
  const userId = useAuthStore((s) => s.user?.id)
  const { isAdmin, isSuperAdmin, loading: accesoLoading } = useAccesoUsuario()
  const [roles, setRoles] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelado = false
    supabase
      .from('permisos')
      .select('modulo_key')
      .eq('user_id', userId)
      .eq('proyecto_id', ADQ_ANCLA_ID)
      .like('modulo_key', 'adq:%')
      .then(({ data }) => {
        if (cancelado) return
        setRoles(new Set((data ?? []).map((p) => p.modulo_key.slice(4))))
        setLoading(false)
      })
    return () => {
      cancelado = true
    }
  }, [userId])

  // Mismo criterio que adq_usuario_tiene(): los admin del hub tienen todos los roles
  const esAdmin = isAdmin || isSuperAdmin
  const tiene = useCallback((rol: RolAdq) => esAdmin || roles.has(rol), [esAdmin, roles])
  const esCompras = tiene('comprador') || tiene('jefe_compras')
  const puedeSolicitar = tiene('solicitante') || esCompras
  const nivel = tiene('aprobador_3') ? 3 : tiene('aprobador_2') ? 2 : tiene('aprobador_1') ? 1 : 0

  return { userId: userId ?? '', tiene, esCompras, puedeSolicitar, nivel, esAdmin, loading: loading || accesoLoading }
}
