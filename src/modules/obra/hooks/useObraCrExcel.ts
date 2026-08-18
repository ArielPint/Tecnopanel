import { useState } from 'react'
import { useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { parseCR, seedObraCrModulos, type SeedResult } from '../lib/crParser'
import { invalidateObraCr } from './useObraCrData'

const BUCKET = 'dashboard-docs'
const OBJECT_PATH = 'lachacra-cr.xlsx'

export function useObraCrExcel() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<SeedResult | null>(null)

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true, dense: true })
      const rows = parseCR(wb)
      const proyectoId = await getProyectoId(proyectoSlug!)
      const result = await seedObraCrModulos(proyectoId, rows)
      const { error: upError } = await supabase.storage.from(BUCKET).upload(OBJECT_PATH, file, { upsert: true })
      if (upError) throw upError
      setLastResult(result)
      invalidateObraCr(proyectoSlug!)
      toast.success('CR cargado y aplicado para todo el equipo')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo procesar el archivo'
      setError(msg)
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }

  return { uploading, error, lastResult, handleFile }
}
