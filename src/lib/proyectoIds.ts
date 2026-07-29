import { supabase } from './supabaseClient'

const cache = new Map<string, Promise<string>>()

export function getProyectoId(slug: string): Promise<string> {
  if (!cache.has(slug)) {
    cache.set(
      slug,
      (async () => {
        const { data, error } = await supabase.from('proyectos').select('id').eq('slug', slug).single()
        if (error || !data) throw new Error(`proyecto "${slug}" no encontrado`)
        return data.id as string
      })(),
    )
  }
  return cache.get(slug)!
}
