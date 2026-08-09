import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'

export interface Grupo {
  id: number
  nombre: string
  activo: boolean
}

export interface Responsable {
  id: number
  nombre: string
  activo: boolean
  grupo_id: number | null
}

export function useResponsables() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const proyectoId = await getProyectoId(proyectoSlug!)
    const [gRes, rRes] = await Promise.all([
      supabase.from('grupos').select('*').eq('proyecto_id', proyectoId).order('nombre'),
      supabase.from('responsables').select('*').order('nombre'),
    ])
    if (gRes.error) setError(gRes.error.message)
    else if (rRes.error) setError(rRes.error.message)
    else {
      setGrupos((gRes.data ?? []) as Grupo[])
      setResponsables((rRes.data ?? []) as Responsable[])
    }
    setLoading(false)
  }, [proyectoSlug])

  useEffect(() => {
    refetch()
    const channel = supabase
      .channel('logistica_responsables')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grupos' }, () => refetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'responsables' }, () => refetch())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetch])

  const crearGrupo = useCallback(
    async (nombre: string) => {
      const proyectoId = await getProyectoId(proyectoSlug!)
      const { error } = await supabase.from('grupos').insert({ nombre, activo: true, proyecto_id: proyectoId })
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch, proyectoSlug],
  )

  const editarGrupo = useCallback(
    async (id: number, nombre: string) => {
      const { error } = await supabase.from('grupos').update({ nombre }).eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  const eliminarGrupo = useCallback(
    async (id: number) => {
      const { error } = await supabase.from('grupos').delete().eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  const agregarResponsable = useCallback(
    async (grupoId: number, nombre: string) => {
      const { error } = await supabase.from('responsables').insert({ nombre, activo: true, grupo_id: grupoId })
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  const toggleResponsable = useCallback(
    async (id: number, activo: boolean) => {
      const { error } = await supabase.from('responsables').update({ activo: !activo }).eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  const eliminarResponsable = useCallback(
    async (id: number) => {
      const { error } = await supabase.from('responsables').delete().eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return {
    grupos,
    responsables,
    loading,
    error,
    crearGrupo,
    editarGrupo,
    eliminarGrupo,
    agregarResponsable,
    toggleResponsable,
    eliminarResponsable,
  }
}
