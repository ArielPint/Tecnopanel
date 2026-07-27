import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

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

export function useConfigFinanciero() {
  const [totalComprado, setTotalComprado] = useState<number | null>(null)
  const [presupuesto, setPresupuesto] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const [comprado, { data }] = await Promise.all([
      loadTotalComprado(),
      supabase.from('config').select('value').eq('key', 'presupuesto_total').maybeSingle(),
    ])
    setTotalComprado(comprado)
    setPresupuesto(data?.value != null ? parseFloat(data.value) || null : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const guardarPresupuesto = useCallback(
    async (valor: number) => {
      const { error } = await supabase.from('config').update({ value: String(Math.round(valor)) }).eq('key', 'presupuesto_total')
      if (error) throw new Error(error.message)
      await refetch()
    },
    [refetch],
  )

  return { totalComprado, presupuesto, loading, guardarPresupuesto }
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

export interface FilaMensual {
  mes: number
  valor: number
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export { MESES }

export function useTablaAnual(tabla: 'avance_econ_proy' | 'ajustes_compras') {
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
