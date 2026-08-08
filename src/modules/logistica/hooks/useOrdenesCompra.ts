import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { getVTI } from '../lib/calc'

export interface OrdenCompra {
  id: string
  numero: string
  proveedor: string | null
  fecha: string | null
  notas: string | null
  created_at: string | null
  created_by: string | null
}

export interface OCGuia {
  id: number
  oc_id: string
  gd: string
}

export interface NuevaOC {
  numero: string
  proveedor: string
  fecha: string | null
  notas: string
  gds: string[]
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

interface OrdenesData {
  ordenes: OrdenCompra[]
  guias: OCGuia[]
  montoPorOC: Record<string, number>
}

export function useOrdenesCompra() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()

  const fetcher = useCallback(async (): Promise<OrdenesData> => {
    const proyectoId = await getProyectoId(proyectoSlug!)

    const PAGE = 1000
    let comprasData: { gd: string; cantidad_sol: number | null; devolucion: number | null; valor_und: number | null; valor_total_item: number | null }[] = []
    let from = 0
    let done = false
    while (!done) {
      const { data, error: qError } = await supabase
        .from('registro_compras')
        .select('gd,cantidad_sol,devolucion,valor_und,valor_total_item')
        .eq('proyecto_id', proyectoId)
        .range(from, from + PAGE - 1)
      if (qError) throw new Error(qError.message)
      const rows = data ?? []
      comprasData = comprasData.concat(rows)
      done = rows.length < PAGE
      from += PAGE
    }

    const [ocRes, ogRes] = await Promise.all([
      supabase.from('ordenes_compra').select('*').eq('proyecto_id', proyectoId).order('created_at', { ascending: false }),
      supabase.from('oc_guias').select('*').eq('proyecto_id', proyectoId),
    ])
    if (ocRes.error) throw new Error(ocRes.error.message)
    if (ogRes.error) throw new Error(ogRes.error.message)

    const ocData = (ocRes.data ?? []) as OrdenCompra[]
    const ogData = (ogRes.data ?? []) as OCGuia[]

    const montoPorGD: Record<string, number> = {}
    for (const r of comprasData) {
      const gd = String(r.gd)
      montoPorGD[gd] = (montoPorGD[gd] || 0) + getVTI(r)
    }
    const montos: Record<string, number> = {}
    for (const oc of ocData) {
      const gds = ogData.filter((og) => og.oc_id === oc.id).map((og) => String(og.gd))
      montos[oc.id] = gds.reduce((s, gd) => s + (montoPorGD[gd] || 0), 0)
    }

    return { ordenes: ocData, guias: ogData, montoPorOC: montos }
  }, [proyectoSlug])

  const { data, loading, error, refetch } = useCachedQuery<OrdenesData>(
    proyectoSlug ? `ordenes_compra:${proyectoSlug}` : null,
    fetcher,
    60_000,
  )
  const ordenes = data?.ordenes ?? []
  const guias = data?.guias ?? []
  const montoPorOC = data?.montoPorOC ?? {}

  const guardar = useCallback(
    async (input: NuevaOC, id: string | null, createdBy: string) => {
      const isNew = !id
      const ocId = id ?? genId()
      const proyectoId = await getProyectoId(proyectoSlug!)
      const record = {
        id: ocId,
        numero: input.numero,
        proveedor: input.proveedor,
        fecha: input.fecha || null,
        notas: input.notas,
        created_by: createdBy,
        ...(isNew ? { created_at: new Date().toISOString(), proyecto_id: proyectoId } : {}),
      }
      if (isNew) {
        const { error } = await supabase.from('ordenes_compra').insert(record)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('ordenes_compra').update(record).eq('id', ocId)
        if (error) throw new Error(error.message)
      }
      const { error: delError } = await supabase.from('oc_guias').delete().eq('oc_id', ocId)
      if (delError) throw new Error(delError.message)
      if (input.gds.length) {
        const { error: insError } = await supabase
          .from('oc_guias')
          .insert(input.gds.map((gd) => ({ oc_id: ocId, gd, proyecto_id: proyectoId })))
        if (insError) throw new Error(insError.message)
      }
      await refetch()
    },
    [refetch, proyectoSlug],
  )

  const eliminar = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('ordenes_compra').delete().eq('id', id)
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { ordenes, guias, montoPorOC, loading, error, guardar, eliminar }
}
