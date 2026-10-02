import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { invalidatePrefix } from '@/lib/queryCache'
import {
  AVANCE_AJUSTE_MENSUAL_KEY,
  PRESUPUESTO_MENSUAL_KEY,
  loadAjusteAvanceMensual,
  loadPresupuestoMensual,
} from '@/modules/planta/lib/supaData'

async function loadTotalComprado(): Promise<number> {
  const PAGE = 1000
  let total = 0
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('registro_compras')
      .select('valor_total_item, valor_und, cantidad_sol, devolucion')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data) break
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

/** "0,192213" o "0.192213" → número; vacío → null; texto inválido → NaN. */
export function parseDecimal(texto: string): number | null {
  const t = texto.trim()
  if (!t) return null
  return /^-?\d+([.,]\d+)?$/.test(t) ? parseFloat(t.replace(',', '.')) : NaN
}

/** Presupuesto por mes (config.presupuesto_mensual; un mes vacío usa el presupuesto total) y avance
 *  adicional por mes en puntos porcentuales (config.avance_ajuste_mensual; vacío = sin ajuste). */
export function usePresupuestoMensual() {
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [valores, setValores] = useState<string[]>(Array(12).fill(''))
  const [ajustes, setAjustes] = useState<string[]>(Array(12).fill(''))
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const [mapa, mapaAjuste] = await Promise.all([loadPresupuestoMensual(), loadAjusteAvanceMensual()])
      setValores(MESES.map((_, i) => (mapa[`${anio}-${i + 1}`] ? String(Math.round(mapa[`${anio}-${i + 1}`])) : '')))
      setAjustes(MESES.map((_, i) => (mapaAjuste[`${anio}-${i + 1}`] != null ? String(mapaAjuste[`${anio}-${i + 1}`]).replace('.', ',') : '')))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar el presupuesto por mes')
    }
    setLoading(false)
  }, [anio])

  useEffect(() => {
    refetch()
  }, [refetch])

  const actualizar = useCallback((mesIdx: number, texto: string) => {
    setValores((v) => v.map((x, i) => (i === mesIdx ? texto : x)))
  }, [])

  const actualizarAjuste = useCallback((mesIdx: number, texto: string) => {
    setAjustes((v) => v.map((x, i) => (i === mesIdx ? texto : x)))
  }, [])

  const guardar = useCallback(async () => {
    const invalido = valores.findIndex((t) => t.trim() !== '' && !(parseFloat(t) > 0))
    if (invalido >= 0) throw new Error(`El presupuesto de ${MESES[invalido]} no es válido`)
    const ajusteInvalido = ajustes.findIndex((t) => Number.isNaN(parseDecimal(t)))
    if (ajusteInvalido >= 0) throw new Error(`El avance adicional de ${MESES[ajusteInvalido]} no es válido (usa por ejemplo 0,192213)`)
    // Se relee antes de escribir: cada JSON guarda todos los años y aquí solo se reemplaza el visible.
    const [mapa, mapaAjuste] = await Promise.all([loadPresupuestoMensual(), loadAjusteAvanceMensual()])
    for (let m = 1; m <= 12; m++) {
      delete mapa[`${anio}-${m}`]
      delete mapaAjuste[`${anio}-${m}`]
    }
    valores.forEach((t, i) => {
      if (parseFloat(t) > 0) mapa[`${anio}-${i + 1}`] = Math.round(parseFloat(t))
    })
    ajustes.forEach((t, i) => {
      const n = parseDecimal(t)
      if (n) mapaAjuste[`${anio}-${i + 1}`] = n
    })
    const { error } = await supabase.from('config').upsert(
      [
        { key: PRESUPUESTO_MENSUAL_KEY, value: JSON.stringify(mapa) },
        { key: AVANCE_AJUSTE_MENSUAL_KEY, value: JSON.stringify(mapaAjuste) },
      ],
      { onConflict: 'key' },
    )
    if (error) throw new Error(error.message)
    invalidatePrefix('resumen_data:') // los gráficos de avance económico se recalculan al volver
    await refetch()
  }, [anio, valores, ajustes, refetch])

  return { anio, setAnio, valores, ajustes, actualizar, actualizarAjuste, loading, guardar }
}

export function useRitmoProyeccion() {
  const [ritmoTope, setRitmoTope] = useState(15)
  const [ritmoTorre3, setRitmoTorre3] = useState(6)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('config').select('key, value').in('key', ['proy_ritmo_tope', 'proy_ritmo_torre3_fijo'])
    if (error) toast.error(error.message)
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
  // config.proy_extra_avEcon_activo ('true'/'false'). Sin la fila se muestra, como antes de existir.
  const [activo, setActivo] = useState(true)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('config').select('key, value').in('key', ['proy_extra_avEcon', 'proy_extra_avEcon_activo'])
    if (error) toast.error(error.message)
    for (const r of data ?? []) {
      if (r.key === 'proy_extra_avEcon' && r.value != null) setValor(parseFloat(r.value) || 4.5)
      if (r.key === 'proy_extra_avEcon_activo') setActivo(r.value !== 'false')
    }
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

  const guardarActivo = useCallback(async (nuevo: boolean) => {
    setActivo(nuevo) // optimista: el gráfico responde al instante; se revierte si falla
    // upsert: la fila no existe hasta el primer cambio
    const { error } = await supabase
      .from('config')
      .upsert({ key: 'proy_extra_avEcon_activo', value: String(nuevo) }, { onConflict: 'key' })
    if (error) {
      setActivo(!nuevo)
      throw new Error(error.message)
    }
  }, [])

  return { valor, activo, loading, guardar, guardarActivo }
}

export function useForecastMensualSeleccionado() {
  const [valor, setValor] = useState('')
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('config').select('value').eq('key', 'forecast_mensual_seleccionado').maybeSingle()
    if (error) toast.error(error.message)
    setValor(data?.value || '')
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const guardar = useCallback(async (nuevoValor: string) => {
    const { error } = await supabase.from('config').update({ value: nuevoValor }).eq('key', 'forecast_mensual_seleccionado')
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
    const { data, error } = await supabase
      .from('avance_econ_proy')
      .select('mes, valor, forecast')
      .eq('anio', anio)
      .order('created_at', { ascending: true })
    if (error) toast.error(error.message)
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
    const { data, error } = await supabase.from(tabla).select('mes, valor').eq('anio', anio).order('mes', { ascending: true })
    if (error) toast.error(error.message)
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
