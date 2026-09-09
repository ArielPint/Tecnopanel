import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { PRODUCTOS_BASE } from '../lib/productosBase'
import { calcCR, calcVUnd, getVTI, normCod } from '../lib/calc'

const PROD_URL = 'https://raw.githubusercontent.com/ArielPint/LA-CHACRA/main/data/productos.json'

export interface Producto {
  codigo: string
  descripcion: string
  unidad: string
  grupo: string
  subgrupo: string
  cantidad_por_modulo: number | null
  ppto: number | null
}

export interface ProductoCustom extends Producto {
  id: string
  activo: boolean
}

/** Consumo acumulado por codigo, calculado desde registro_compras del proyecto. */
export interface ProductoStats {
  /** Suma de cantidad_sol (lo pedido, sin descontar devoluciones). */
  solicitada: number
  /** Suma de devolucion. */
  devuelta: number
  /** solicitada - devuelta: la cantidad que efectivamente se compro. */
  neta: number
  /** Valor unitario de la compra mas reciente (por fecha_guia, o fecha_sol si no hay guia). */
  ultimoValor: number | null
  /** Fecha de esa ultima compra. */
  ultimaFecha: string | null
}

interface CatalogoData {
  allProducts: Producto[]
  customCodes: Set<string>
  pppMap: Record<string, { monto: number; cant: number }>
  statsMap: Record<string, ProductoStats>
}

interface CompraRow {
  codigo: string
  cantidad_sol: number | null
  devolucion: number | null
  valor_und: number | null
  valor_total_item: number | null
  fecha_guia: string | null
  fecha_sol: string | null
}

/** registro_compras pasa las 4.500 filas por proyecto y PostgREST corta en 1000 por
 * request, asi que hay que paginar o los acumulados (PPP, solicitado) salen truncados. */
async function fetchCompras(proyectoId: string): Promise<CompraRow[]> {
  const PAGE = 1000
  const all: CompraRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('registro_compras')
      .select('codigo,cantidad_sol,devolucion,valor_und,valor_total_item,fecha_guia,fecha_sol')
      .eq('proyecto_id', proyectoId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as CompraRow[]
    all.push(...rows)
    if (rows.length < PAGE) return all
  }
}

export function useCatalogoGD() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()

  const fetcher = useCallback(async (): Promise<CatalogoData> => {
    const proyectoId = await getProyectoId(proyectoSlug!)
    const [pptoRes, customRes, compras] = await Promise.all([
      fetch(`${PROD_URL}?v=${Date.now()}`)
        .then((r) => (r.ok ? r.json() : []))
        .catch((e) => {
          console.error('useCatalogoGD: fallo al cargar precios ppto', e)
          return []
        }),
      supabase.from('productos_custom').select('*').eq('activo', true),
      fetchCompras(proyectoId),
    ])
    if (customRes.error) throw new Error(customRes.error.message)

    const pptoMap: Record<string, number> = {}
    for (const p of pptoRes as { codigo: string; ppto: number }[]) {
      pptoMap[normCod(p.codigo)] = p.ppto
    }

    const custom = (customRes.data ?? []) as ProductoCustom[]
    const base: Record<string, Producto> = {}
    for (const p of PRODUCTOS_BASE) base[normCod(p.codigo)] = { ...p, ppto: null }
    for (const c of custom) {
      const k = normCod(c.codigo)
      const prevCpm = base[k]?.cantidad_por_modulo
      base[k] = {
        codigo: c.codigo,
        descripcion: c.descripcion,
        unidad: c.unidad,
        grupo: c.grupo,
        subgrupo: c.subgrupo,
        cantidad_por_modulo: c.cantidad_por_modulo ?? prevCpm ?? null,
        ppto: c.ppto ?? null,
      }
    }
    for (const p of Object.values(base)) {
      if (p.ppto == null) p.ppto = pptoMap[normCod(p.codigo)] ?? null
    }

    const merged = Object.values(base).sort((a, b) => a.descripcion.localeCompare(b.descripcion))
    const pMap: Record<string, { monto: number; cant: number }> = {}
    const sMap: Record<string, ProductoStats> = {}
    for (const r of compras) {
      const k = normCod(r.codigo)
      if (!k) continue
      if (!sMap[k]) sMap[k] = { solicitada: 0, devuelta: 0, neta: 0, ultimoValor: null, ultimaFecha: null }
      const st = sMap[k]
      st.solicitada += r.cantidad_sol || 0
      st.devuelta += r.devolucion || 0
      st.neta = st.solicitada - st.devuelta

      const cr = calcCR(r)
      if (cr <= 0) continue
      const vt = getVTI(r)
      if (vt <= 0) continue
      if (!pMap[k]) pMap[k] = { monto: 0, cant: 0 }
      pMap[k].monto += vt
      pMap[k].cant += cr

      const fecha = r.fecha_guia || r.fecha_sol || null
      // Sin fecha no se puede ordenar: solo sirve si aun no hay ningun candidato fechado.
      if (st.ultimoValor == null || (fecha != null && (st.ultimaFecha == null || fecha >= st.ultimaFecha))) {
        st.ultimoValor = calcVUnd(r)
        st.ultimaFecha = fecha
      }
    }

    return {
      allProducts: merged,
      customCodes: new Set(custom.map((c) => normCod(c.codigo))),
      pppMap: pMap,
      statsMap: sMap,
    }
  }, [proyectoSlug])

  const { data, loading, error, refetch } = useCachedQuery<CatalogoData>(
    proyectoSlug ? `catalogo_gd:${proyectoSlug}` : null,
    fetcher,
    5 * 60_000,
  )
  const allProducts = data?.allProducts ?? []
  const customCodes = data?.customCodes ?? new Set<string>()
  const pppMap = data?.pppMap ?? {}
  const statsMap = data?.statsMap ?? {}

  const guardar = useCallback(
    async (input: Producto, creadoPor: string) => {
      const { error } = await supabase
        .from('productos_custom')
        .upsert({ ...input, activo: true, creado_por: creadoPor }, { onConflict: 'codigo' })
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  const ocultar = useCallback(
    async (producto: Producto, creadoPor: string) => {
      const { error } = await supabase
        .from('productos_custom')
        .upsert({ ...producto, activo: false, creado_por: creadoPor }, { onConflict: 'codigo' })
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { allProducts, customCodes, pppMap, statsMap, loading, error, refetch, guardar, ocultar }
}
