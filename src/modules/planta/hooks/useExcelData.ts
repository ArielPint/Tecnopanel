import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { cargarXLSX } from '@/lib/cargarLibrerias'
import { supabase } from '@/lib/supabaseClient'
import { parseWorkbook, type ParsedDashboardData } from '../lib/excelParser'

const BUCKET = 'dashboard-docs'
const OBJECT_PATH = 'lachacra.xlsm'

export function useExcelData() {
  const [excelData, setExcelData] = useState<ParsedDashboardData | null>(null)
  const [autoLoading, setAutoLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    async function autoLoad() {
      const { data, error: dlError } = await supabase.storage.from(BUCKET).download(OBJECT_PATH)
      if (cancelado) return
      if (dlError || !data) {
        setAutoLoading(false)
        return
      }
      try {
        const [buf, XLSX] = await Promise.all([data.arrayBuffer(), cargarXLSX()])
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true, dense: true })
        if (!cancelado) setExcelData(parseWorkbook(wb, XLSX))
      } catch {
        // Archivo corrupto en el bucket — se deja el prompt de subida manual como fallback
      } finally {
        if (!cancelado) setAutoLoading(false)
      }
    }
    autoLoad()
    return () => {
      cancelado = true
    }
  }, [])

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const [buf, XLSX] = await Promise.all([file.arrayBuffer(), cargarXLSX()])
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true, dense: true })
      const parsed = parseWorkbook(wb, XLSX)
      const { error: upError } = await supabase.storage.from(BUCKET).upload(OBJECT_PATH, file, { upsert: true })
      if (upError) throw upError
      setExcelData(parsed)
      toast.success('Archivo cargado y aplicado para todo el equipo')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo procesar el archivo'
      setError(msg)
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }

  return { excelData, autoLoading, uploading, error, handleFile }
}
