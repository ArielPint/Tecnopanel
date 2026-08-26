import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'
import { getProyectoId } from '@/lib/proyectoIds'

interface PermisosProyecto {
  loading: boolean
  isAdmin: boolean
  activo: boolean
  rolNegocio: string | null
  /** Subcontrato asociado al usuario (WEDO/CONBES) — si está seteado, Producción y
   * Avance Obra filtran los módulos a solo los de ese subcontrato. */
  subcontrato: 'WEDO' | 'CONBES' | null
  tieneAccion: (moduloKey: string, accion?: string) => boolean
}

interface Estado {
  loading: boolean
  isAdmin: boolean
  activo: boolean
  rolNegocio: string | null
  subcontrato: 'WEDO' | 'CONBES' | null
  granted: Set<string>
}

const ESTADO_INICIAL: Estado = { loading: true, isAdmin: false, activo: false, rolNegocio: null, subcontrato: null, granted: new Set() }

export function usePermisosProyecto(proyectoSlug: string): PermisosProyecto {
  const userId = useAuthStore((s) => s.user?.id)
  const authLoading = useAuthStore((s) => s.loading)
  const [estado, setEstado] = useState<Estado>(ESTADO_INICIAL)

  useEffect(() => {
    // esperar a que authStore resuelva sesión antes de decidir nada — misma
    // race que se encontró y corrigió en useAccesoUsuario (Fase A/B).
    if (authLoading) return

    if (!userId) {
      setEstado({ loading: false, isAdmin: false, activo: false, rolNegocio: null, subcontrato: null, granted: new Set() })
      return
    }

    let cancelado = false
    setEstado((prev) => ({ ...prev, loading: true }))

    async function resolver(intento = 0) {
      try {
        const proyectoId = await getProyectoId(proyectoSlug)
        const [
          { data: profile, error: profileErr },
          { data: permisos, error: permisosErr },
          { data: modulos, error: modulosErr },
          { data: access, error: accessErr },
        ] = await Promise.all([
          supabase.from('profiles').select('rol, activo').eq('id', userId).maybeSingle(),
          supabase.from('permisos').select('modulo_key, accion').eq('user_id', userId).eq('proyecto_id', proyectoId),
          supabase.from('proyecto_modulos').select('modulo_key, habilitado').eq('proyecto_id', proyectoId),
          supabase.from('project_access').select('rol_negocio').eq('user_id', userId).eq('proyecto_id', proyectoId).maybeSingle(),
        ])
        const queryErr = profileErr ?? permisosErr ?? modulosErr ?? accessErr
        if (queryErr) throw queryErr
        if (cancelado) return

        const habilitados = new Set((modulos ?? []).filter((m) => m.habilitado).map((m) => m.modulo_key))
        // modulo_key con sufijo (ej. "financiero:oc" para el permiso de edición de
        // una sección) hereda el habilitado/deshabilitado del módulo base.
        const granted = new Set(
          (permisos ?? [])
            .filter((p) => habilitados.has(p.modulo_key.split(':')[0]))
            .map((p) => `${p.modulo_key}:${p.accion}`),
        )
        // '_subcontrato' no es un módulo real (no vive en proyecto_modulos) — se lee
        // aparte de `granted`, que solo captura módulos habilitados en el proyecto.
        const subcontratoRow = (permisos ?? []).find((p) => p.modulo_key === '_subcontrato')
        const subcontrato = subcontratoRow?.accion === 'WEDO' || subcontratoRow?.accion === 'CONBES' ? subcontratoRow.accion : null

        setEstado({
          loading: false,
          isAdmin: profile?.rol === 'admin',
          activo: profile?.activo !== false,
          rolNegocio: access?.rol_negocio ?? null,
          subcontrato,
          granted,
        })
      } catch (err) {
        if (cancelado) return
        // Mismo race de token de primer login del día que useAccesoUsuario — un 401 espurio
        // acá vacía `granted` y hace que el aterrizaje automático mande a un módulo que el
        // usuario en realidad sí tiene, pero que la respuesta con error hizo ver como vacío.
        if (intento === 0) {
          await new Promise((r) => setTimeout(r, 500))
          if (!cancelado) resolver(1)
          return
        }
        console.error('usePermisosProyecto: error al resolver permisos', err)
        setEstado({ loading: false, isAdmin: false, activo: false, rolNegocio: null, subcontrato: null, granted: new Set() })
      }
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
    subcontrato: estado.subcontrato,
    tieneAccion: (moduloKey: string, accion = 'ver') => estado.isAdmin || estado.granted.has(`${moduloKey}:${accion}`),
  }
}
