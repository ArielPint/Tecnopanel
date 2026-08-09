import { supabase } from './supabaseClient'

const cache = new Map<string, Promise<string>>()

export function getProyectoId(slug: string): Promise<string> {
  if (!cache.has(slug)) {
    cache.set(
      slug,
      (async () => {
        try {
          // Reintenta una vez: si esta query es de las primeras que dispara la app tras
          // cargar la sesión desde localStorage, puede salir antes de que el token recién
          // refrescado quede attacheado al cliente (carrera real vista en prod, 401 espurio
          // en "proyectos" en el primer load). Un solo retry le da tiempo al refresh.
          let data, error
          for (let intento = 0; intento < 2; intento++) {
            ;({ data, error } = await supabase.from('proyectos').select('id').eq('slug', slug).single())
            if (!error && data) break
            if (intento === 0) await new Promise((r) => setTimeout(r, 500))
          }
          if (error || !data) throw new Error(`proyecto "${slug}" no encontrado`)
          return data.id as string
        } catch (err) {
          cache.delete(slug)
          throw err
        }
      })(),
    )
  }
  return cache.get(slug)!
}
