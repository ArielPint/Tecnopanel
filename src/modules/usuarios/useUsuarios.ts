import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export interface UsuarioAcceso {
  proyecto: string
  slug: string
  rol: string
}

export interface Usuario {
  id: string
  nombre: string
  apellido: string | null
  email: string
  rol: string
  activo: boolean
  accesos: UsuarioAcceso[]
}

export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [{ data: profiles, error: profilesError }, { data: access, error: accessError }, { data: proyectos, error: proyectosError }] =
        await Promise.all([
          supabase.from('profiles').select('id, nombre, apellido, email, rol, activo').order('nombre'),
          supabase.from('project_access').select('user_id, proyecto_id, rol'),
          supabase.from('proyectos').select('id, nombre, slug'),
        ])

      if (cancelled) return

      const err = profilesError || accessError || proyectosError
      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }

      const proyectoById = new Map((proyectos ?? []).map((p) => [p.id, p]))
      const accesosPorUsuario = new Map<string, UsuarioAcceso[]>()
      for (const a of access ?? []) {
        const proyecto = proyectoById.get(a.proyecto_id)
        if (!proyecto) continue
        const list = accesosPorUsuario.get(a.user_id) ?? []
        list.push({ proyecto: proyecto.nombre, slug: proyecto.slug, rol: a.rol })
        accesosPorUsuario.set(a.user_id, list)
      }

      const mapped: Usuario[] = (profiles ?? []).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        apellido: p.apellido,
        email: p.email,
        rol: p.rol,
        activo: p.activo,
        accesos: accesosPorUsuario.get(p.id) ?? [],
      }))

      setUsuarios(mapped)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { usuarios, loading, error }
}
