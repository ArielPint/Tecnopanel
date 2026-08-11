import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabaseClient'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { parseStock, upsertStock, type StockUpsertResult } from '../lib/stockParser'
import { useAuth } from './useAuth'

export interface StockProducto {
  id: string
  codigo: string
  descripcion: string
  unidad: string | null
  cantidad_disponible: number
  actualizado_en: string
}

async function fetchStock(): Promise<StockProducto[]> {
  const { data, error } = await supabase
    .from('stock_productos')
    .select('id, codigo, descripcion, unidad, cantidad_disponible, actualizado_en')
    .order('descripcion')
  if (error) throw new Error(error.message)
  return (data ?? []) as StockProducto[]
}

// Catálogo global (sin proyecto_id) — misma cache key en cualquier obra.
export function useStock() {
  const { perfil } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<StockUpsertResult | null>(null)

  const { data, loading, refetch } = useCachedQuery<StockProducto[]>('stock_productos', fetchStock, 60_000)

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', dense: true })
      const rows = parseStock(wb)
      const result = await upsertStock(rows, perfil!.id)
      setLastResult(result)
      await refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar el archivo')
    } finally {
      setUploading(false)
    }
  }

  return { stock: data ?? [], loading, uploading, error, lastResult, handleFile }
}
