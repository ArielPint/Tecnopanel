import { useState } from 'react'
import { useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { parseAvanceProduccion, seedPlantaModulos, type SeedResult } from '../lib/avanceProduccionParser'

const BUCKET = 'dashboard-docs'
const OBJECT_PATH = 'lachacra-avance.xlsm'

export function useAvanceProduccionExcel() {
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
      const rows = parseAvanceProduccion(wb)
      const proyectoId = await getProyectoId(proyectoSlug!)
      const result = await seedPlantaModulos(proyectoId, rows)
      const { error: upError } = await supabase.storage.from(BUCKET).upload(OBJECT_PATH, file, { upsert: true })
      if (upError) throw upError
      setLastResult(result)
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
