import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export function useEliminarProyecto() {
  const [eliminando, setEliminando] = useState(false)

  const eliminar = useCallback(async (id: string) => {
    setEliminando(true)
    try {
      const { error } = await supabase.from('proyectos').delete().eq('id', id)
      if (error) {
        // 23503 = foreign_key_violation — el proyecto tiene datos asociados (despachos,
        // compras, financiero, etc). Esas tablas no tienen ON DELETE CASCADE a propósito,
        // para no borrar información real por accidente.
        if (error.code === '23503') {
          throw new Error('No se puede eliminar: el proyecto tiene datos asociados (compras, despachos, financiero, etc).')
        }
        throw new Error(error.message)
      }
    } finally {
      setEliminando(false)
    }
  }, [])

  return { eliminar, eliminando }
}
