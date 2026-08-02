import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'
import { getProyectoId } from '@/lib/proyectoIds'

interface PermisosProyecto {
  loading: boolean
  isAdmin: boolean
  activo: boolean
  rolNegocio: string | null
  tieneAccion: (moduloKey: string, accion?: string) => boolean
}

interface Estado {
  loading: boolean
  isAdmin: boolean
  activo: boolean
  rolNegocio: string | null
  granted: Set<string>
}

const ESTADO_INICIAL: Estado = { loading: true, isAdmin: false, activo: false, rolNegocio: null, granted: new Set() }

export function usePermisosProyecto(proyectoSlug: string): PermisosProyecto {
  const userId = useAuthStore((s) => s.user?.id)
  const authLoading = useAuthStore((s) => s.loading)
  const [estado, setEstado] = useState<Estado>(ESTADO_INICIAL)

  useEffect(() => {
    // esperar a que authStore resuelva sesión antes de decidir nada — misma
    // race que se encontró y corrigió en useAccesoUsuario (Fase A/B).
    if (authLoading) return

    if (!userId) {
      setEstado({ loading: false, isAdmin: false, activo: false, rolNegocio: null, granted: new Set() })
      return
    }

    let cancelado = false
    setEstado((prev) => ({ ...prev, loading: true }))

    async function resolver() {
      const proyectoId = await getProyectoId(proyectoSlug)
      const [{ data: profile }, { data: permisos }, { data: modulos }, { data: access }] = await Promise.all([
        supabase.from('profiles').select('rol, activo').eq('id', userId).maybeSingle(),
        supabase.from('permisos').select('modulo_key, accion').eq('user_id', userId).eq('proyecto_id', proyectoId),
        supabase.from('proyecto_modulos').select('modulo_key, habilitado').eq('proyecto_id', proyectoId),
        supabase.from('project_access').select('rol_negocio').eq('user_id', userId).eq('proyecto_id', proyectoId).maybeSingle(),
      ])
      if (cancelado) return

      const habilitados = new Set((modulos ?? []).filter((m) => m.habilitado).map((m) => m.modulo_key))
      // modulo_key con sufijo (ej. "financiero:oc" para el permiso de edición de
      // una sección) hereda el habilitado/deshabilitado del módulo base.
      const granted = new Set(
        (permisos ?? [])
          .filter((p) => habilitados.has(p.modulo_key.split(':')[0]))
          .map((p) => `${p.modulo_key}:${p.accion}`),
      )

      setEstado({
        loading: false,
        isAdmin: profile?.rol === 'admin',
        activo: profile?.activo !== false,
        rolNegocio: access?.rol_negocio ?? null,
        granted,
      })
    }

    resolver()
    return () => {
      cancelado = true
    }
  }, [userId, authLoading, proyectoSlug])

  return {
    loading: estado.loading,
    isAdmin: estado.isAdmin,
    activo: estado.activo,
    rolNegocio: estado.rolNegocio,
    tieneAccion: (moduloKey: string, accion = 'ver') => estado.isAdmin || estado.granted.has(`${moduloKey}:${accion}`),
  }
}
