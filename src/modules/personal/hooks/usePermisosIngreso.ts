import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { ING_ANCLA_ID } from '@/lib/proyectoIds'
import { useAuthStore } from '@/store/authStore'
import { useAccesoUsuario } from '@/hooks/useAccesoUsuario'
import type { RolIngreso } from '../lib/catalogos'

/** Roles del usuario en el portal, para mostrar u ocultar menús y botones. La RLS y las funciones
 *  ing_* son las que mandan de verdad; esto solo evita ofrecer lo que la base va a rechazar. */
export function usePermisosIngreso() {
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
      .eq('proyecto_id', ING_ANCLA_ID)
      .like('modulo_key', 'ing:%')
      .then(({ data }) => {
        if (cancelado) return
        setRoles(new Set((data ?? []).map((p) => p.modulo_key.slice(4))))
        setLoading(false)
      })
    return () => {
      cancelado = true
    }
  }, [userId])

  // Mismo criterio que ing_usuario_tiene(): los admin del hub tienen todos los roles
  const esAdmin = isAdmin || isSuperAdmin
  const tiene = useCallback((rol: RolIngreso) => esAdmin || roles.has(rol), [esAdmin, roles])
  const puedeSolicitar = tiene('solicitante') || tiene('coordinador') || tiene('rrhh')
  // igual que ing_gestiona_contratistas()
  const gestionaContratistas = tiene('rrhh') || tiene('prevencion') || tiene('coordinador')

  return { userId: userId ?? '', tiene, puedeSolicitar, gestionaContratistas, esAdmin, loading: loading || accesoLoading }
}
