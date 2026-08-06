import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
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
        const buf = await data.arrayBuffer()
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true, dense: true })
        if (!cancelado) setExcelData(parseWorkbook(wb))
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
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true, dense: true })
      const parsed = parseWorkbook(wb)
      const { error: upError } = await supabase.storage.from(BUCKET).upload(OBJECT_PATH, file, { upsert: true })
      if (upError) throw upError
      setExcelData(parsed)
      toast.success('Archivo cargado y aplicado para todo el equipo')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar el archivo')
    } finally {
      setUploading(false)
    }
  }

  return { excelData, autoLoading, uploading, error, handleFile }
}
