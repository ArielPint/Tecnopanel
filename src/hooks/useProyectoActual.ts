import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

const cache = new Map<string, Promise<string>>()

// Nombre real del proyecto activo (ej. "La Chacra") a partir del slug de la URL —
// reemplaza el label "LA CHACRA" que estaba hardcodeado en los 6 layouts de módulo.
export function useProyectoActual() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [nombre, setNombre] = useState<string | null>(null)

  useEffect(() => {
    if (!proyectoSlug) return
    if (!cache.has(proyectoSlug)) {
      cache.set(
        proyectoSlug,
        (async () => {
          const { data } = await supabase.from('proyectos').select('nombre').eq('slug', proyectoSlug).single()
          return data?.nombre ?? proyectoSlug
        })(),
      )
    }
    let cancelado = false
    cache.get(proyectoSlug)!.then((n) => {
      if (!cancelado) setNombre(n)
    })
    return () => {
      cancelado = true
    }
  }, [proyectoSlug])

  return { nombre: nombre ?? proyectoSlug ?? '', slug: proyectoSlug ?? '' }
}
