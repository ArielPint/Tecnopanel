import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

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
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('proveedores').select('*').eq('activo', true).order('nombre', { ascending: true })
    if (!error) setProveedores((data ?? []) as Proveedor[])
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

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
