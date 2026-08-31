import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Sucursal } from '@/lib/lineasNegocio'

export interface NuevoProyectoInput {
  nombre: string
  slug: string
  descripcion?: string
  /** modulo_key de los módulos a habilitar — elegidos por el admin, ya no una copia ciega del catálogo de La Chacra. */
  modulos: string[]
  sucursal: Sucursal
  /** id de las líneas de negocio del proyecto — puede ser más de una (F1, plan §8.2). */
  lineas: string[]
}

export function useCrearProyecto() {
  const [creando, setCreando] = useState(false)

  const crear = useCallback(async (input: NuevoProyectoInput) => {
    setCreando(true)
    try {
      const { data: proyecto, error: errorProyecto } = await supabase
        .from('proyectos')
        .insert({
          nombre: input.nombre,
          slug: input.slug,
          descripcion: input.descripcion ?? null,
          tipo: 'construccion',
          sucursal: input.sucursal,
        })
        .select('id, nombre, slug')
        .single()
      if (errorProyecto) throw new Error(errorProyecto.message)

      if (input.lineas.length > 0) {
        const { error: errorLineas } = await supabase
          .from('proyecto_lineas')
          .insert(input.lineas.map((linea_id) => ({ proyecto_id: proyecto.id, linea_id })))
        if (errorLineas) throw new Error(errorLineas.message)
      }

      if (input.modulos.length > 0) {
        const { error: errorInsertModulos } = await supabase
          .from('proyecto_modulos')
          .insert(input.modulos.map((modulo_key) => ({ proyecto_id: proyecto.id, modulo_key, habilitado: true })))
        if (errorInsertModulos) throw new Error(errorInsertModulos.message)
      }

      return proyecto as { id: string; nombre: string; slug: string }
    } finally {
      setCreando(false)
    }
  }, [])

  return { crear, creando }
}
