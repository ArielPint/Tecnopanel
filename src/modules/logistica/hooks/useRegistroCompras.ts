import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { invalidate } from '@/lib/queryCache'

export interface RegistroCompra {
  id: string
  fecha_guia: string | null
  fecha_sol: string | null
  obs_modulo: string | null
  mes: number | null
  gd: string
  oc: string | null
  codigo: string
  descripcion: string | null
  unidad: string | null
  tipo_producto: string | null
  cantidad_sol: number | null
  devolucion: number | null
  cantidad_rec: number | null
  valor_und: number | null
  valor_ppto: number | null
  valor_total_item: number | null
  responsable: string | null
  // N° de la solicitud de materiales de la que salió la línea — una solicitud puede
  // repartirse en varias guías (máx. 25 productos por guía).
  solicitud_numero: number | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

export interface LineaProducto {
  codigo: string
  descripcion: string
  unidad: string
  tipo_producto: string
  ppto: number
  cantidad_sol: number
  devolucion: number
  valor_total_item: number
}

export interface MetaEntrada {
  fechaGuia: string
  fechaSol: string
  obs: string
  gd: string
  oc: string
  responsable: string
}

export interface EdicionSingle {
  fechaGuia: string
  fechaSol: string
  obs: string
  gd: string
  oc: string
  responsable: string
  codigo: string
  descripcion: string
  unidad: string
  tipoProducto: string
  cantidadSol: number
  devolucion: number
  valorTotalItem: number
  ppto: number
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function useRegistroCompras() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const cacheKey = proyectoSlug ? `registro_compras:${proyectoSlug}` : null

  const fetchAll = useCallback(async () => {
    const PAGE = 1000
    let all: RegistroCompra[] = []
    let from = 0
    let done = false
    const proyectoId = await getProyectoId(proyectoSlug!)
    while (!done) {
      const { data, error: qError } = await supabase
        .from('registro_compras')
        .select('*')
        .eq('proyecto_id', proyectoId)
        .order('fecha_guia', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + PAGE - 1)
      if (qError) throw new Error(qError.message)
      const rows = (data ?? []) as RegistroCompra[]
      all = all.concat(rows)
      done = rows.length < PAGE
      from += PAGE
    }
    return all
  }, [proyectoSlug])

  // Sin realtime acá: cache 2min + invalidación explícita tras cada mutación propia.
  const { data, loading, error, refetch } = useCachedQuery<RegistroCompra[]>(cacheKey, fetchAll, 2 * 60_000)
  const registros = data ?? []

  const crearMulti = useCallback(
    async (meta: MetaEntrada, lineas: LineaProducto[], createdBy: string, solicitudNumero: number | null) => {
      const proyectoId = await getProyectoId(proyectoSlug!)
      const fechaMes = new Date(meta.fechaGuia + 'T12:00:00').getMonth() + 1
      const nowIso = new Date().toISOString()
      const records = lineas
        .filter((l) => l.codigo)
        .map((l) => {
          const cr = l.cantidad_sol - l.devolucion
          const vu = cr ? l.valor_total_item / cr : 0
          return {
            id: genId(),
            proyecto_id: proyectoId,
            fecha_guia: meta.fechaGuia || null,
            fecha_sol: meta.fechaSol || null,
            obs_modulo: meta.obs,
            mes: fechaMes,
            gd: meta.gd,
            oc: meta.oc,
            codigo: l.codigo,
            descripcion: l.descripcion,
            unidad: l.unidad,
            tipo_producto: l.tipo_producto,
            cantidad_sol: l.cantidad_sol,
            devolucion: l.devolucion,
            cantidad_rec: cr,
            valor_total_item: l.valor_total_item,
            valor_und: vu,
            valor_ppto: l.ppto,
            responsable: meta.responsable,
            solicitud_numero: solicitudNumero,
            created_at: nowIso,
            updated_at: nowIso,
            created_by: createdBy,
          }
        })
      if (!records.length) throw new Error('Agrega al menos un producto.')
      const { error: insError } = await supabase.from('registro_compras').insert(records)
      if (insError) throw new Error(insError.message)
      if (solicitudNumero != null) {
        // Solo la primera guía la marca: las siguientes no pisan `usada_en`.
        const { error: solError } = await supabase
          .from('solicitudes')
          .update({ estado: 'usada', usada_en: new Date().toISOString() })
          .eq('numero', solicitudNumero)
          .eq('proyecto_id', proyectoId)
          .neq('estado', 'usada')
        if (solError) throw new Error(solError.message)
        // Cross-invalidation: useSolicitudes.ts cachea por proyectoSlug, misma key acá.
        invalidate(`solicitudes:${proyectoSlug}`)
      }
      await refetch()
    },
    [refetch, proyectoSlug],
  )

  // Actualiza varias líneas de una guía y recarga UNA vez al final: con una recarga por línea
  // (miles de filas cada una) guardar una guía de 25 productos disparaba 25 recargas en paralelo.
  // Se guardan de a LINEAS_EN_PARALELO: con las 25 a la vez el servidor propio (Caddy → PostgREST)
  // cortaba algunas conexiones (502). Devuelve cuántas líneas no se pudieron guardar.
  const actualizarVarios = useCallback(
    async (cambios: { id: string; input: EdicionSingle }[], createdBy: string) => {
      if (!cambios.length) return 0
      const proyectoId = await getProyectoId(proyectoSlug!)
      let fallidas = 0
      for (let i = 0; i < cambios.length; i += LINEAS_EN_PARALELO) {
        const tramo = cambios.slice(i, i + LINEAS_EN_PARALELO)
        const resultados = await Promise.allSettled(tramo.map(({ id, input }) => actualizarLinea(proyectoId, id, input, createdBy)))
        fallidas += resultados.filter((r) => r.status === 'rejected').length
      }
      await refetch()
      return fallidas
    },
    [refetch, proyectoSlug],
  )

  // Borra varias líneas en una sola consulta (todo o nada) y recarga una vez.
  const eliminar = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return
      const proyectoId = await getProyectoId(proyectoSlug!)
      const { error: delError } = await supabase
        .from('registro_compras')
        .delete()
        .in('id', ids)
        .eq('proyecto_id', proyectoId)
      if (delError) throw new Error(delError.message)
      await refetch()
    },
    [refetch, proyectoSlug],
  )

  return { registros, loading, error, refetch, crearMulti, actualizarVarios, eliminar }
}

const LINEAS_EN_PARALELO = 5

async function actualizarLinea(proyectoId: string, id: string, input: EdicionSingle, createdBy: string) {
  const fechaMes = new Date(input.fechaGuia + 'T12:00:00').getMonth() + 1
  const cr = input.cantidadSol - input.devolucion
  const vu = cr ? input.valorTotalItem / cr : 0
  const record = {
    fecha_guia: input.fechaGuia || null,
    fecha_sol: input.fechaSol || null,
    obs_modulo: input.obs,
    mes: fechaMes,
    gd: input.gd,
    oc: input.oc,
    codigo: input.codigo,
    descripcion: input.descripcion,
    unidad: input.unidad,
    tipo_producto: input.tipoProducto,
    cantidad_sol: input.cantidadSol,
    devolucion: input.devolucion,
    cantidad_rec: cr,
    valor_total_item: input.valorTotalItem,
    valor_und: vu,
    valor_ppto: input.ppto,
    responsable: input.responsable,
    updated_at: new Date().toISOString(),
    created_by: createdBy,
  }
  const { error: updError } = await supabase
    .from('registro_compras')
    .update(record)
    .eq('id', id)
    .eq('proyecto_id', proyectoId)
  if (updError) throw new Error(updError.message)
}
