import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { parseDotacion, type DotacionMes } from '../lib/dotacionParser'

export interface FilaDotacion {
  anio: number
  mes: number
  personas: number
  dias_hombre: number
  costo_empresa: number
  horas_extras: number
  bono_produccion: number
  cargas_hhee_bono: number
  fuente: string | null
}

/** Dotación mensual de MOD: lectura para el tab Productividad y escritura desde Configuración. */
export function useDotacionMod() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [filas, setFilas] = useState<FilaDotacion[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const proyectoId = await getProyectoId(proyectoSlug!)
      const { data, error: e } = await supabase
        .from('mod_dotacion_mensual')
        .select('anio, mes, personas, dias_hombre, costo_empresa, horas_extras, bono_produccion, cargas_hhee_bono, fuente')
        .eq('proyecto_id', proyectoId)
        .order('anio', { ascending: true })
        .order('mes', { ascending: true })
      if (e) throw e
      setFilas(
        (data ?? []).map((r) => ({
          anio: r.anio,
          mes: r.mes,
          personas: r.personas ?? 0,
          dias_hombre: parseFloat(String(r.dias_hombre ?? 0)) || 0,
          costo_empresa: parseFloat(String(r.costo_empresa ?? 0)) || 0,
          horas_extras: parseFloat(String(r.horas_extras ?? 0)) || 0,
          bono_produccion: parseFloat(String(r.bono_produccion ?? 0)) || 0,
          cargas_hhee_bono: parseFloat(String(r.cargas_hhee_bono ?? 0)) || 0,
          fuente: r.fuente ?? null,
        })),
      )
      setError(null)
    } catch (e) {
      // Sin permiso `dashboard:productividad` la RLS devuelve vacío, no error;
      // un error acá es de verdad (red o esquema).
      const msg = e instanceof Error ? e.message : 'No se pudo cargar la dotación'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [proyectoSlug])

  useEffect(() => {
    refetch()
  }, [refetch])

  const guardar = useCallback(
    async (fila: FilaDotacion) => {
      const proyectoId = await getProyectoId(proyectoSlug!)
      const { error: e } = await supabase
        .from('mod_dotacion_mensual')
        .upsert({ proyecto_id: proyectoId, ...fila, updated_at: new Date().toISOString() }, { onConflict: 'proyecto_id,anio,mes' })
      if (e) throw new Error(e.message)
      await refetch()
    },
    [proyectoSlug, refetch],
  )

  const eliminar = useCallback(
    async (anio: number, mes: number) => {
      const proyectoId = await getProyectoId(proyectoSlug!)
      const { error: e } = await supabase
        .from('mod_dotacion_mensual')
        .delete()
        .eq('proyecto_id', proyectoId)
        .eq('anio', anio)
        .eq('mes', mes)
      if (e) throw new Error(e.message)
      await refetch()
    },
    [proyectoSlug, refetch],
  )

  /** Lee la planilla de remuneraciones y guarda el mes. `periodo` manda si la hoja no trae mes/año. */
  const subirPlanilla = useCallback(
    async (file: File, periodo?: { anio: number; mes: number }): Promise<DotacionMes> => {
      setUploading(true)
      setError(null)
      try {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
        const d = parseDotacion(wb, XLSX)
        const anio = periodo?.anio ?? d.anio
        const mes = periodo?.mes ?? d.mes
        if (!anio || !mes) throw new Error(`No se pudo deducir el mes desde la hoja "${d.hoja}" — elegí mes y año a mano`)
        await guardar({
          anio,
          mes,
          personas: d.personas,
          dias_hombre: d.diasHombre,
          costo_empresa: d.costoEmpresa,
          horas_extras: d.horasExtras,
          bono_produccion: d.bonoProduccion,
          cargas_hhee_bono: Math.round(d.cargasHheeBono),
          fuente: file.name,
        })
        return { ...d, anio, mes }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'No se pudo procesar la planilla'
        setError(msg)
        toast.error(msg)
        throw e
      } finally {
        setUploading(false)
      }
    },
    [guardar],
  )

  return { filas, loading, uploading, error, refetch, guardar, eliminar, subirPlanilla }
}
