import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'
import { getProyectoId } from '@/lib/proyectoIds'

export type Escenario = 'hub_completo' | 'solo_proyecto' | 'solo_crm' | 'selector_portales' | 'sin_acceso'

export interface ProyectoObra {
  id: string
  slug: string
  nombre: string
}

interface AccesoUsuario {
  loading: boolean
  escenario: Escenario | null
  isAdmin: boolean
  /** profiles.is_super_admin — el que realmente exige la RLS de `proyectos` (ALL, incluye delete). No confundir con isAdmin (rol='admin'). */
  isSuperAdmin: boolean
  tieneCrm: boolean
  tieneProyecto: boolean
  /** permisos(modulo_key='gestion') sobre el proyecto pseudo `tipo='sistema'` — ver §3.6/syncPermisosGestion. */
  tieneGestion: boolean
  /** Proyectos tipo obra con permiso real — Fase F: antes era un boolean fijo a La Chacra, ahora N proyectos. */
  proyectosObra: ProyectoObra[]
}

const ESTADO_INICIAL: AccesoUsuario = {
  loading: true,
  escenario: null,
  isAdmin: false,
  isSuperAdmin: false,
  tieneCrm: false,
  tieneProyecto: false,
  tieneGestion: false,
  proyectosObra: [],
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
      setEstado({ loading: false, escenario: null, isAdmin: false, isSuperAdmin: false, tieneCrm: false, tieneProyecto: false, tieneGestion: false, proyectosObra: [] })
      return
    }

    let cancelado = false
    setEstado((prev) => ({ ...prev, loading: true }))

    async function resolver(intento = 0) {
      try {
        const [
          { data: profile, error: profileErr },
          { data: permisos, error: permisosErr },
          crmId,
          sistemaId,
          { data: obras, error: obrasErr },
        ] = await Promise.all([
          supabase.from('profiles').select('rol, activo, is_super_admin').eq('id', userId).maybeSingle(),
          // Fase E5 prep: reemplaza profiles.modulos/user_profiles.active (decorativos post
          // Fase D) por la señal real — cualquier fila en `permisos` para ese proyecto.
          supabase.from('permisos').select('proyecto_id').eq('user_id', userId),
          getProyectoId('crm'),
          getProyectoId('sistema'),
          // Fase F: proyectos tipo obra real, no CRM ni el pseudo-proyecto 'sistema' (§3.6, ancla de
          // Gestión) — mismo criterio que ProyectosPage/DashboardPage.
          supabase.from('proyectos').select('id, slug, nombre').not('tipo', 'in', '(crm,sistema)').order('nombre'),
        ])
        const queryErr = profileErr ?? permisosErr ?? obrasErr
        if (queryErr) throw queryErr
        if (cancelado) return

        if (!profile || profile.activo === false) {
          setEstado({ loading: false, escenario: 'sin_acceso', isAdmin: false, isSuperAdmin: false, tieneCrm: false, tieneProyecto: false, tieneGestion: false, proyectosObra: [] })
          return
        }
        const isAdmin = profile.rol === 'admin'
        const isSuperAdmin = !!profile.is_super_admin
        const proyectosConAcceso = new Set((permisos ?? []).map((p) => p.proyecto_id))
        const tieneCrm = isAdmin || proyectosConAcceso.has(crmId)
        const tieneGestion = isAdmin || proyectosConAcceso.has(sistemaId)
        const proyectosObra = (obras ?? []).filter((p) => isAdmin || proyectosConAcceso.has(p.id))
        const tieneProyecto = proyectosObra.length > 0

        if (isAdmin) {
          setEstado({ loading: false, escenario: 'hub_completo', isAdmin, isSuperAdmin, tieneCrm, tieneProyecto, tieneGestion, proyectosObra })
          return
        }

        let escenario: Escenario
        if (tieneCrm && tieneProyecto) escenario = 'selector_portales'
        else if (tieneCrm) escenario = 'solo_crm'
        else if (tieneProyecto) escenario = 'solo_proyecto'
        else escenario = 'sin_acceso'

        setEstado({ loading: false, escenario, isAdmin, isSuperAdmin, tieneCrm, tieneProyecto, tieneGestion, proyectosObra })
      } catch (err) {
        if (cancelado) return
        // Mismo race de token que getProyectoId (ver comentario ahí): profiles/permisos no
        // tenían retry propio, así que un 401 espurio ahí caía directo a "sin acceso" para
        // cualquiera, admin incluido. Un retry a nivel resolver cubre las tres queries a la vez.
        if (intento === 0) {
          await new Promise((r) => setTimeout(r, 500))
          if (!cancelado) resolver(1)
          return
        }
        console.error('useAccesoUsuario: error al resolver acceso', err)
        setEstado({ loading: false, escenario: 'sin_acceso', isAdmin: false, isSuperAdmin: false, tieneCrm: false, tieneProyecto: false, tieneGestion: false, proyectosObra: [] })
      }
    }

    resolver()
    return () => {
      cancelado = true
    }
  }, [userId, authLoading])

  return estado
}
