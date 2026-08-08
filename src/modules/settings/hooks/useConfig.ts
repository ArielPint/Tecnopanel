import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useCachedQuery } from '@/lib/useCachedQuery'

async function loadTotalComprado(): Promise<number> {
  const PAGE = 1000
  let total = 0
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('registro_compras')
      .select('valor_total_item, valor_und, cantidad_sol, devolucion')
      .range(from, from + PAGE - 1)
    if (error || !data) break
    for (const r of data) {
      const cantRec = (parseFloat(String(r.cantidad_sol)) || 0) - (parseFloat(String(r.devolucion)) || 0)
      const vti =
        r.valor_total_item != null && r.valor_total_item !== ''
          ? parseFloat(String(r.valor_total_item)) || 0
          : (parseFloat(String(r.valor_und)) || 0) * cantRec
      total += vti
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return total
}

interface ConfigFinancieroData {
  totalComprado: number
  presupuesto: number | null
}

// Global, sin scope por proyecto. loadTotalComprado escanea registro_compras
// completo (paginado) — vale cachear 30s para no repetir el escaneo en cada
// visita a Settings. Sin realtime.
export function useConfigFinanciero() {
  const fetcher = useCallback(async (): Promise<ConfigFinancieroData> => {
    const [comprado, { data }] = await Promise.all([
      loadTotalComprado(),
      supabase.from('config').select('value').eq('key', 'presupuesto_total').maybeSingle(),
    ])
    return { totalComprado: comprado, presupuesto: data?.value != null ? parseFloat(data.value) || null : null }
  }, [])

  const { data, loading, refetch } = useCachedQuery<ConfigFinancieroData>('config_financiero', fetcher, 30_000)

  const guardarPresupuesto = useCallback(
    async (valor: number) => {
      const { error } = await supabase.from('config').update({ value: String(Math.round(valor)) }).eq('key', 'presupuesto_total')
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { totalComprado: data?.totalComprado ?? null, presupuesto: data?.presupuesto ?? null, loading, guardarPresupuesto }
}

export function useRitmoProyeccion() {
  const [ritmoTope, setRitmoTope] = useState(15)
  const [ritmoTorre3, setRitmoTorre3] = useState(6)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('config').select('key, value').in('key', ['proy_ritmo_tope', 'proy_ritmo_torre3_fijo'])
    for (const r of data ?? []) {
      if (r.key === 'proy_ritmo_tope' && r.value) setRitmoTope(parseFloat(r.value) || 15)
      if (r.key === 'proy_ritmo_torre3_fijo' && r.value) setRitmoTorre3(parseFloat(r.value) || 6)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const guardar = useCallback(async (tope: number, torre3: number) => {
    const [r1, r2] = await Promise.all([
      supabase.from('config').update({ value: String(tope) }).eq('key', 'proy_ritmo_tope'),
      supabase.from('config').update({ value: String(torre3) }).eq('key', 'proy_ritmo_torre3_fijo'),
    ])
    if (r1.error || r2.error) throw new Error(r1.error?.message || r2.error?.message)
    setRitmoTope(tope)
    setRitmoTorre3(torre3)
  }, [])

  return { ritmoTope, ritmoTorre3, loading, guardar }
}

export function useProyExtraAvEcon() {
  const [valor, setValor] = useState(4.5)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('config').select('value').eq('key', 'proy_extra_avEcon').maybeSingle()
    if (data?.value != null) setValor(parseFloat(data.value) || 4.5)
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const guardar = useCallback(async (nuevoValor: number) => {
    const { error } = await supabase.from('config').update({ value: String(nuevoValor) }).eq('key', 'proy_extra_avEcon')
    if (error) throw new Error(error.message)
    setValor(nuevoValor)
  }, [])

  return { valor, loading, guardar }
}

export interface FilaMensual {
  mes: number
  valor: number
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export { MESES }

export interface ForecastColumn {
  key: string
  label: string
  originalLabel: string | null
  valores: string[]
}

export function useAvanceEconProy() {
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [columnas, setColumnas] = useState<ForecastColumn[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('avance_econ_proy')
      .select('mes, valor, forecast')
      .eq('anio', anio)
      .order('created_at', { ascending: true })
    const orden: string[] = []
    const map: Record<string, string[]> = {}
    for (const r of (data ?? []) as { mes: number; valor: number; forecast: string }[]) {
      if (!map[r.forecast]) {
        map[r.forecast] = Array(12).fill('0')
        orden.push(r.forecast)
      }
      map[r.forecast][r.mes - 1] = ((parseFloat(String(r.valor)) || 0) * 100).toFixed(4)
    }
    setColumnas(orden.map((label) => ({ key: label, label, originalLabel: label, valores: map[label] })))
    setLoading(false)
  }, [anio])

  useEffect(() => {
    refetch()
  }, [refetch])

  const agregarColumna = useCallback(() => {
    setColumnas((cols) => [...cols, { key: `nueva-${cols.length}-${Date.now()}`, label: '', originalLabel: null, valores: Array(12).fill('0') }])
  }, [])

  const actualizarLabel = useCallback((key: string, label: string) => {
    setColumnas((cols) => cols.map((c) => (c.key === key ? { ...c, label } : c)))
  }, [])

  const actualizarValor = useCallback((key: string, mesIdx: number, texto: string) => {
    setColumnas((cols) => cols.map((c) => (c.key === key ? { ...c, valores: c.valores.map((v, i) => (i === mesIdx ? texto : v)) } : c)))
  }, [])

  const guardar = useCallback(async () => {
    if (columnas.some((c) => !c.label.trim())) throw new Error('Todas las columnas necesitan un nombre')
    for (const c of columnas) {
      if (c.originalLabel && c.originalLabel !== c.label) {
        const { error } = await supabase.from('avance_econ_proy').delete().eq('anio', anio).eq('forecast', c.originalLabel)
        if (error) throw new Error(error.message)
      }
      const payload = c.valores.map((texto, i) => ({ anio, mes: i + 1, forecast: c.label, valor: (parseFloat(texto) || 0) / 100 }))
      const { error } = await supabase.from('avance_econ_proy').upsert(payload, { onConflict: 'anio,mes,forecast' })
      if (error) throw new Error(error.message)
    }
    await refetch()
  }, [anio, columnas, refetch])

  return { anio, setAnio, columnas, loading, agregarColumna, actualizarLabel, actualizarValor, guardar }
}

export function useTablaAnual(tabla: 'ajustes_compras') {
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [filas, setFilas] = useState<FilaMensual[]>(MESES.map((_, i) => ({ mes: i + 1, valor: 0 })))
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from(tabla).select('mes, valor').eq('anio', anio).order('mes', { ascending: true })
    const map: Record<number, number> = {}
    for (const r of (data ?? []) as { mes: number; valor: number }[]) map[r.mes] = parseFloat(String(r.valor)) || 0
    setFilas(MESES.map((_, i) => ({ mes: i + 1, valor: map[i + 1] ?? 0 })))
    setLoading(false)
  }, [tabla, anio])

  useEffect(() => {
    refetch()
  }, [refetch])

  const guardar = useCallback(
    async (nuevasFilas: FilaMensual[]) => {
      const payload = nuevasFilas.map((f) => ({ anio, mes: f.mes, valor: f.valor }))
      const { error } = await supabase.from(tabla).upsert(payload, { onConflict: 'anio,mes' })
      if (error) throw new Error(error.message)
      setFilas(nuevasFilas)
    },
    [tabla, anio],
  )

  return { anio, setAnio, filas, setFilas, loading, guardar }
}
