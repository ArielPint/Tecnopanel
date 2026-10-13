import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type TipoDocumentoSap = 'factura' | 'anticipo' | 'nota_credito'

/**
 * Una fila de venta de un mes. Viene de SAP (`sap_ventas`, solo en el servidor propio) o, donde esa
 * tabla no existe, de `ventas_unificada` (guías de despacho) cruzada con proyecto y líneas.
 */
export interface FilaVenta {
  /** Clave para agrupar por proyecto: id del proyecto del portal o código de proyecto SAP ('' = sin proyecto). */
  proyectoId: string
  proyecto: string
  sucursal: string | null
  lineas: string[]
  periodo: string
  /** Unidades despachadas; null en las ventas de SAP (sus cantidades mezclan unidades de medida). */
  unidades: number | null
  montoPesos: number
  /** UF del mes; null si nadie la cargó todavía. */
  uf: number | null
  /** montoPesos / uf, o null si falta la UF — nunca 0, para no fingir una venta en cero. */
  montoUf: number | null
  /** Solo SAP: factura, factura de anticipo o nota de crédito (esta última en negativo). */
  tipo: TipoDocumentoSap | null
  cliente: string | null
}

export type FuenteVentas = 'sap' | 'despachos'

export interface ValorUf {
  periodo: string
  valor: number
  origen: 'manual' | 'api'
  ultimo_error: string | null
}

interface FilaSap {
  periodo: string
  tipo: TipoDocumentoSap
  proyecto_codigo: string
  proyecto_nombre: string | null
  linea: string | null
  sucursal: string | null
  cliente_nombre: string | null
  monto_neto: number | string
}

// La tabla de SAP existe solo en el servidor propio: en Supabase PostgREST responde "no existe".
function noExiste(err: { code?: string } | null): boolean {
  return err?.code === 'PGRST205' || err?.code === '42P01'
}

const PAGINA = 1000

async function cargarSap(): Promise<FilaSap[]> {
  const filas: FilaSap[] = []
  // PostgREST corta en max-rows: se pide por páginas hasta que una vuelva incompleta.
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from('sap_ventas')
      .select('periodo, tipo, proyecto_codigo, proyecto_nombre, linea, sucursal, cliente_nombre, monto_neto')
      .order('periodo')
      .order('tipo')
      .order('proyecto_codigo')
      .order('ceco')
      .order('cliente_codigo')
      .range(desde, desde + PAGINA - 1)
    if (error) throw new Error(error.message)
    filas.push(...((data ?? []) as FilaSap[]))
    if (!data || data.length < PAGINA) return filas
  }
}

export function useVentas() {
  const [filas, setFilas] = useState<FilaVenta[]>([])
  const [ufs, setUfs] = useState<ValorUf[]>([])
  const [fuente, setFuente] = useState<FuenteVentas>('despachos')
  const [sincronizadoEn, setSincronizadoEn] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Las vistas no tienen FK declaradas, así que el embed de PostgREST no aplica:
  // se traen las consultas y se cruzan acá. Son tablas chicas.
  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const [estado, valores] = await Promise.all([
        supabase.from('sap_ventas_estado').select('sincronizado_en').maybeSingle(),
        supabase.from('valores_uf').select('periodo, valor, origen, ultimo_error').order('periodo'),
      ])
      if (valores.error) throw new Error(valores.error.message)
      if (estado.error && !noExiste(estado.error)) throw new Error(estado.error.message)
      const ufPorPeriodo = new Map((valores.data ?? []).map((u) => [u.periodo, Number(u.valor)]))
      const conUf = (periodo: string, montoPesos: number) => {
        const uf = ufPorPeriodo.get(periodo) ?? null
        return { uf, montoUf: uf ? montoPesos / uf : null }
      }

      let nuevas: FilaVenta[]
      if (!estado.error) {
        setFuente('sap')
        setSincronizadoEn(estado.data?.sincronizado_en ?? null)
        nuevas = (await cargarSap()).map((v) => {
          const montoPesos = Number(v.monto_neto)
          return {
            proyectoId: v.proyecto_codigo,
            proyecto: v.proyecto_codigo
              ? `${v.proyecto_codigo}${v.proyecto_nombre ? ` · ${v.proyecto_nombre}` : ''}`
              : 'Sin proyecto en SAP',
            sucursal: v.sucursal,
            lineas: v.linea ? [v.linea] : [],
            periodo: v.periodo,
            unidades: null,
            montoPesos,
            ...conUf(v.periodo, montoPesos),
            tipo: v.tipo,
            cliente: v.cliente_nombre,
          }
        })
      } else {
        setFuente('despachos')
        setSincronizadoEn(null)
        const [ventas, proyectos, puentes] = await Promise.all([
          supabase.from('ventas_unificada').select('*').order('periodo'),
          supabase.from('proyectos').select('id, nombre, sucursal'),
          supabase.from('proyecto_lineas').select('proyecto_id, lineas_negocio(codigo)'),
        ])
        const primerError = ventas.error || proyectos.error || puentes.error
        if (primerError) throw new Error(primerError.message)

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
        nuevas = (ventas.data ?? []).map((v) => {
          const proyecto = porProyecto.get(v.proyecto_id)
          const montoPesos = Number(v.monto_pesos)
          return {
            proyectoId: v.proyecto_id,
            proyecto: proyecto?.nombre ?? '(proyecto sin acceso)',
            sucursal: proyecto?.sucursal ?? null,
            lineas: lineasPorProyecto.get(v.proyecto_id) ?? [],
            periodo: v.periodo,
            unidades: Number(v.unidades),
            montoPesos,
            ...conUf(v.periodo, montoPesos),
            tipo: null,
            cliente: null,
          }
        })
      }
      setUfs((valores.data ?? []) as ValorUf[])
      setFilas(nuevas)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las ventas')
    } finally {
      setLoading(false)
    }
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

  return { filas, ufs, fuente, sincronizadoEn, loading, error, recargar: cargar, guardarUf }
}
