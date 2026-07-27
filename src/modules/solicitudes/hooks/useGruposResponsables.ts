import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export interface Grupo {
  id: number
  nombre: string
}

export interface Responsable {
  id: number
  nombre: string
  grupo_id: number | null
}

export function useGruposResponsables() {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [loading, setLoading] = useState(true)
  const [recetas, setRecetas] = useState<Record<number, string[]>>({})

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      const [rg, rr] = await Promise.all([
        supabase.from('grupos').select('id, nombre').eq('activo', true).order('nombre'),
        supabase.from('responsables').select('id, nombre, grupo_id').eq('activo', true).order('nombre'),
      ])
      if (cancelado) return
      setGrupos((rg.data ?? []) as Grupo[])
      setResponsables((rr.data ?? []) as Responsable[])
      setLoading(false)
    }
    cargar()
    return () => {
      cancelado = true
    }
  }, [])

  const cargarReceta = useCallback(
    async (grupoId: number): Promise<string[]> => {
      if (recetas[grupoId]) return recetas[grupoId]
      const { data } = await supabase.from('recetas_grupo').select('codigo').eq('grupo_id', grupoId)
      const codigos = (data ?? []).map((d) => d.codigo as string)
      setRecetas((prev) => ({ ...prev, [grupoId]: codigos }))
      return codigos
    },
    [recetas],
  )

  return { grupos, responsables, loading, cargarReceta }
}
