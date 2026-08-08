import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { PRODUCTOS_BASE } from '../lib/productosBase'
import { calcCR, getVTI, normCod } from '../lib/calc'

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

interface CatalogoData {
  allProducts: Producto[]
  customCodes: Set<string>
  pppMap: Record<string, { monto: number; cant: number }>
}

export function useCatalogoGD() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()

  const fetcher = useCallback(async (): Promise<CatalogoData> => {
    const proyectoId = await getProyectoId(proyectoSlug!)
    const [pptoRes, customRes, comprasRes] = await Promise.all([
      fetch(`${PROD_URL}?v=${Date.now()}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      supabase.from('productos_custom').select('*').eq('activo', true),
      supabase
        .from('registro_compras')
        .select('codigo,cantidad_sol,devolucion,valor_und,valor_total_item')
        .eq('proyecto_id', proyectoId),
    ])
    if (customRes.error) throw new Error(customRes.error.message)
    if (comprasRes.error) throw new Error(comprasRes.error.message)

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
    for (const r of comprasRes.data ?? []) {
      const cr = calcCR(r)
      if (cr <= 0) continue
      const vt = getVTI(r)
      if (vt <= 0) continue
      const k = normCod(r.codigo)
      if (!pMap[k]) pMap[k] = { monto: 0, cant: 0 }
      pMap[k].monto += vt
      pMap[k].cant += cr
    }

    return {
      allProducts: merged,
      customCodes: new Set(custom.map((c) => normCod(c.codigo))),
      pppMap: pMap,
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

  return { allProducts, customCodes, pppMap, loading, error, refetch, guardar, ocultar }
}
