import { useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useCachedQuery } from '@/lib/useCachedQuery'

export interface Proveedor {
  id: string
  nombre: string
  rut: string | null
  giro: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  notas: string | null
  activo: boolean
}

export interface ProveedorInput {
  nombre: string
  rut: string | null
  giro: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  notas: string | null
}

export function useProveedores() {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase.from('proveedores').select('*').eq('activo', true).order('nombre', { ascending: true })
    if (error) throw new Error(error.message)
    return (data ?? []) as Proveedor[]
  }, [])

  const { data, loading, refetch } = useCachedQuery<Proveedor[]>('proveedores', fetcher, 5 * 60_000)
  const proveedores = data ?? []

  const crear = useCallback(
    async (input: ProveedorInput, creadoPor: string) => {
      const { data, error } = await supabase
        .from('proveedores')
        .insert({ ...input, creado_por: creadoPor })
        .select()
        .single()
      if (error) throw new Error(error.message)
      await refetch()
      return data as Proveedor
    },
    [refetch],
  )

  return { proveedores, loading, crear }
}
