import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'

export type Escenario = 'hub_completo' | 'solo_proyecto' | 'solo_crm' | 'selector_portales' | 'sin_acceso'

interface AccesoUsuario {
  loading: boolean
  escenario: Escenario | null
  isAdmin: boolean
  tieneCrm: boolean
  tieneProyecto: boolean
}

const ESTADO_INICIAL: AccesoUsuario = {
  loading: true,
  escenario: null,
  isAdmin: false,
  tieneCrm: false,
  tieneProyecto: false,
}

export function useAccesoUsuario(): AccesoUsuario {
  const userId = useAuthStore((s) => s.user?.id)
  const authLoading = useAuthStore((s) => s.loading)
  const [estado, setEstado] = useState<AccesoUsuario>(ESTADO_INICIAL)

  useEffect(() => {
    // authStore todavía no resolvió si hay sesión — no decidir nada todavía,
    // para no devolver un `loading:false` transitorio con datos viejos que
    // ProtectedRoute pueda leer como "sin acceso" antes de tiempo (race real,
    // encontrada probando Fase B: /crm rebotaba a "/" en la primera carga).
    if (authLoading) return

    if (!userId) {
      setEstado({ loading: false, escenario: null, isAdmin: false, tieneCrm: false, tieneProyecto: false })
      return
    }

    let cancelado = false
    setEstado((prev) => ({ ...prev, loading: true }))

    async function resolver() {
      const [{ data: profile }, { data: userProfile }] = await Promise.all([
        supabase.from('profiles').select('rol, activo, modulos').eq('id', userId).maybeSingle(),
        // ponytail: project_access existe pero hoy es decorativa (full_access uniforme para
        // los 23 usuarios x 2 proyectos, ver auditoría) — no sirve para gatear. La señal real
        // de acceso a La Chacra es la fila en user_profiles, que es lo que el resto de módulos
        // ya usa para autorizar. Normalizar esto es la Fase C del plan de identidad.
        supabase.from('user_profiles').select('active').eq('id', userId).maybeSingle(),
      ])
      if (cancelado) return

      if (!profile || profile.activo === false) {
        setEstado({ loading: false, escenario: 'sin_acceso', isAdmin: false, tieneCrm: false, tieneProyecto: false })
        return
      }
      const isAdmin = profile.rol === 'admin'
      const tieneCrm = isAdmin || (profile.modulos?.length ?? 0) > 0
      const tieneProyecto = isAdmin || (!!userProfile && userProfile.active !== false)

      if (isAdmin) {
        setEstado({ loading: false, escenario: 'hub_completo', isAdmin, tieneCrm, tieneProyecto })
        return
      }

      let escenario: Escenario
      if (tieneCrm && tieneProyecto) escenario = 'selector_portales'
      else if (tieneCrm) escenario = 'solo_crm'
      else if (tieneProyecto) escenario = 'solo_proyecto'
      else escenario = 'sin_acceso'

      setEstado({ loading: false, escenario, isAdmin, tieneCrm, tieneProyecto })
    }

    resolver()
    return () => {
      cancelado = true
    }
  }, [userId, authLoading])

  return estado
}
