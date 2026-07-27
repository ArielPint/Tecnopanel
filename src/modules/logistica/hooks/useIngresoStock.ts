import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { Producto } from './useCatalogoGD'
import { normCod } from '../lib/calc'
import { weekKey, weekLabel, dateFromWeekKey } from '../lib/week'

export interface StockItem {
  id: string | null
  codigo: string
  material: string
  unidad: string
  qty: number | null
  stockFisico: number
  dirty: boolean
}

interface RawStockItem {
  id: string | null
  codigo: string
  material: string
  unidad: string
  stockFisico: number
  dirty: boolean
}

interface RegistroStockRow {
  id: string
  codigo: string
  material: string
  unidad: string
  stock_fisico: number
}

export function useIngresoStock(productos: Producto[]) {
  const [semanas, setSemanas] = useState<{ key: string; label: string }[]>([])
  const [semanaKey, setSemanaKey] = useState(String(weekKey(new Date())))
  const [rawItems, setRawItems] = useState<RawStockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const prodMap = useMemo(() => {
    const m: Record<string, Producto> = {}
    for (const p of productos) m[normCod(p.codigo)] = p
    return m
  }, [productos])

  // items deriva qty de prodMap en cada render — evita que un fetch corrido antes de que cargue el catálogo se quede con qty=null para siempre
  const items = useMemo<StockItem[]>(
    () => rawItems.map((r) => ({ ...r, qty: prodMap[normCod(r.codigo)]?.cantidad_por_modulo ?? null })),
    [rawItems, prodMap],
  )

  const cargarSemana = useCallback(async (key: string) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('registro_stock')
      .select('id, codigo, material, unidad, stock_fisico')
      .eq('semana_key', key)
      .order('material', { ascending: true })
    if (!error) {
      const rows = (data ?? []) as RegistroStockRow[]
      setRawItems(
        rows.map((r) => ({
          id: r.id,
          codigo: r.codigo,
          material: r.material,
          unidad: r.unidad,
          stockFisico: +r.stock_fisico,
          dirty: false,
        })),
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelado = false
    async function init() {
      const { data } = await supabase.from('registro_stock').select('semana_key').order('semana_key', { ascending: false }).limit(1000)
      if (cancelado) return
      const vistas = new Set<string>((data ?? []).map((r: { semana_key: string }) => String(r.semana_key)))
      const actual = String(weekKey(new Date()))
      vistas.add(actual)
      const lista = [...vistas]
        .sort((a, b) => +b - +a)
        .map((k) => ({ key: k, label: 'Semana ' + weekLabel(+k) + (k === actual ? ' (actual)' : '') }))
      setSemanas(lista)
      await cargarSemana(actual)
    }
    init()
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setSemana = useCallback(
    (key: string) => {
      setSemanaKey(key)
      setSemanas((prev) => (prev.some((s) => s.key === key) ? prev : [...prev, { key, label: 'Semana ' + weekLabel(+key) }].sort((a, b) => +b.key - +a.key)))
      cargarSemana(key)
    },
    [cargarSemana],
  )

  const semanaIdx = semanas.findIndex((s) => s.key === semanaKey)
  const goPrev = () => semanaIdx >= 0 && semanaIdx < semanas.length - 1 && setSemana(semanas[semanaIdx + 1].key)
  const goNext = () => semanaIdx > 0 && setSemana(semanas[semanaIdx - 1].key)
  const goHoy = () => setSemana(String(weekKey(new Date())))

  const agregar = useCallback((producto: Producto, stockFisico: number) => {
    setRawItems((prev) => [
      ...prev,
      {
        id: null,
        codigo: producto.codigo,
        material: producto.descripcion,
        unidad: producto.unidad || 'UND',
        stockFisico,
        dirty: true,
      },
    ])
  }, [])

  const editar = useCallback((idx: number, stockFisico: number) => {
    setRawItems((prev) => prev.map((it, i) => (i === idx ? { ...it, stockFisico, dirty: true } : it)))
  }, [])

  const removeItem = useCallback(
    async (idx: number) => {
      const it = rawItems[idx]
      if (it.id) {
        const { error } = await supabase.from('registro_stock').delete().eq('id', it.id)
        if (error) throw new Error(error.message)
      }
      setRawItems((prev) => prev.filter((_, i) => i !== idx))
    },
    [rawItems],
  )

  const guardarTodo = useCallback(
    async (creadoPor: string) => {
      if (!rawItems.length) return
      setSaving(true)
      try {
        const fecha = dateFromWeekKey(+semanaKey)
        const payload = rawItems.map((it) => ({
          semana_key: semanaKey,
          fecha,
          codigo: it.codigo.trim(),
          material: it.material,
          unidad: it.unidad || 'UND',
          stock_fisico: it.stockFisico,
          created_by: creadoPor,
        }))
        const { error } = await supabase.from('registro_stock').upsert(payload, { onConflict: 'semana_key,codigo' })
        if (error) throw new Error(error.message)
        // ponytail: refetch en vez de reconciliar ids localmente — mas simple y evita filas huerfanas si se borra un item recien guardado sin recargar
        await cargarSemana(semanaKey)
      } finally {
        setSaving(false)
      }
    },
    [rawItems, semanaKey, cargarSemana],
  )

  return { semanas, semanaKey, items, loading, saving, setSemana, goPrev, goNext, goHoy, agregar, editar, removeItem, guardarTodo }
}
