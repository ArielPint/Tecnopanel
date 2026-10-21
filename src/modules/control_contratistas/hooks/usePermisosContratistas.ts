import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { CTR_ANCLA_ID } from '@/lib/proyectoIds'
import { useAuthStore } from '@/store/authStore'
import { useAccesoUsuario } from '@/hooks/useAccesoUsuario'
import type { RolContratistas } from '../lib/catalogos'

/** Roles del usuario en Control de Contratistas, para mostrar u ocultar botones. La RLS y las
 *  funciones ing_* / ctr_* son las que mandan; esto solo evita ofrecer lo que la base va a rechazar. */
export function usePermisosContratistas() {
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
      .eq('proyecto_id', CTR_ANCLA_ID)
      .like('modulo_key', 'ctr:%')
      .then(({ data }) => {
        if (cancelado) return
        setRoles(new Set((data ?? []).map((p) => p.modulo_key.slice(4))))
        setLoading(false)
      })
    return () => {
      cancelado = true
    }
  }, [userId])

  // Mismo criterio que ctr_usuario_tiene(): los admin del hub tienen todos los roles
  const esAdmin = isAdmin || isSuperAdmin
  const tiene = useCallback((rol: RolContratistas) => esAdmin || roles.has(rol), [esAdmin, roles])
  // igual que ing_revisa_docs() e ing_valida_ep()
  const revisaDocs = tiene('revisor_docs')
  const validaEp = tiene('revisor_ep') || tiene('aprobador_ep')

  return { userId: userId ?? '', tiene, revisaDocs, validaEp, esAdmin, loading: loading || accesoLoading }
}
