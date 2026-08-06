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

export interface RecetaItem {
  id: string
  codigo: string
}

export function useGruposResponsables() {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [loading, setLoading] = useState(true)
  const [recetas, setRecetas] = useState<Record<number, string[]>>({})
  const [recetasItems, setRecetasItems] = useState<Record<number, RecetaItem[]>>({})

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

  const cargarRecetaItems = useCallback(async (grupoId: number): Promise<RecetaItem[]> => {
    const { data } = await supabase.from('recetas_grupo').select('id, codigo').eq('grupo_id', grupoId).order('codigo')
    const items = (data ?? []) as RecetaItem[]
    setRecetasItems((prev) => ({ ...prev, [grupoId]: items }))
    setRecetas((prev) => ({ ...prev, [grupoId]: items.map((i) => i.codigo) }))
    return items
  }, [])

  const agregarReceta = useCallback(async (grupoId: number, codigo: string) => {
    const { error } = await supabase.from('recetas_grupo').insert({ grupo_id: grupoId, codigo })
    if (error) throw new Error(error.message)
    await cargarRecetaItems(grupoId)
  }, [cargarRecetaItems])

  const quitarReceta = useCallback(async (grupoId: number, id: string) => {
    const { error } = await supabase.from('recetas_grupo').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await cargarRecetaItems(grupoId)
  }, [cargarRecetaItems])

  return { grupos, responsables, loading, cargarReceta, recetasItems, cargarRecetaItems, agregarReceta, quitarReceta }
}
