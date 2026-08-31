import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

/** Una fila de `ventas_unificada` ya cruzada con proyecto, líneas y UF del mes. */
export interface FilaVenta {
  proyectoId: string
  proyecto: string
  sucursal: string | null
  lineas: string[]
  periodo: string
  unidades: number
  montoPesos: number
  /** UF del mes; null si nadie la cargó todavía. */
  uf: number | null
  /** montoPesos / uf, o null si falta la UF — nunca 0, para no fingir una venta en cero. */
  montoUf: number | null
}

export interface ValorUf {
  periodo: string
  valor: number
  origen: 'manual' | 'api'
  ultimo_error: string | null
}

export function useVentas() {
  const [filas, setFilas] = useState<FilaVenta[]>([])
  const [ufs, setUfs] = useState<ValorUf[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // La vista no tiene FK declaradas, así que el embed de PostgREST no aplica:
  // se traen las 4 consultas y se cruzan acá. Son tablas chicas.
  const cargar = useCallback(async () => {
    setLoading(true)
    const [ventas, proyectos, puentes, valores] = await Promise.all([
      supabase.from('ventas_unificada').select('*').order('periodo'),
      supabase.from('proyectos').select('id, nombre, sucursal'),
      supabase.from('proyecto_lineas').select('proyecto_id, lineas_negocio(codigo)'),
      supabase.from('valores_uf').select('periodo, valor, origen, ultimo_error').order('periodo'),
    ])
    const primerError = ventas.error || proyectos.error || puentes.error || valores.error
    if (primerError) {
      setError(primerError.message)
      setLoading(false)
      return
    }

    const porProyecto = new Map((proyectos.data ?? []).map((p) => [p.id, p]))
    const lineasPorProyecto = new Map<string, string[]>()
    // PostgREST tipa el embed como arreglo aunque la relación sea 1-1.
    type Puente = { proyecto_id: string; lineas_negocio: { codigo: string } | { codigo: string }[] | null }
    for (const pl of (puentes.data ?? []) as unknown as Puente[]) {
      const rel = Array.isArray(pl.lineas_negocio) ? pl.lineas_negocio[0] : pl.lineas_negocio
      const codigo = rel?.codigo
      if (!codigo) continue
      lineasPorProyecto.set(pl.proyecto_id, [...(lineasPorProyecto.get(pl.proyecto_id) ?? []), codigo])
    }
    const ufPorPeriodo = new Map((valores.data ?? []).map((u) => [u.periodo, Number(u.valor)]))

    setUfs((valores.data ?? []) as ValorUf[])
    setFilas(
      (ventas.data ?? []).map((v) => {
        const proyecto = porProyecto.get(v.proyecto_id)
        const uf = ufPorPeriodo.get(v.periodo) ?? null
        const montoPesos = Number(v.monto_pesos)
        return {
          proyectoId: v.proyecto_id,
          proyecto: proyecto?.nombre ?? '(proyecto sin acceso)',
          sucursal: proyecto?.sucursal ?? null,
          lineas: lineasPorProyecto.get(v.proyecto_id) ?? [],
          periodo: v.periodo,
          unidades: Number(v.unidades),
          montoPesos,
          uf,
          montoUf: uf ? montoPesos / uf : null,
        }
      }),
    )
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const guardarUf = useCallback(
    async (periodo: string, valor: number) => {
      const { data: sesion } = await supabase.auth.getUser()
      const { error: err } = await supabase.from('valores_uf').upsert(
        {
          periodo,
          valor,
          origen: 'manual',
          ultimo_error: null,
          actualizado_por: sesion.user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'periodo' },
      )
      if (err) throw new Error(err.message)
      await cargar()
    },
    [cargar],
  )

  return { filas, ufs, loading, error, recargar: cargar, guardarUf }
}
