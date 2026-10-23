import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { armarHistoria, type FotoProyecto, type Historia, type Movimiento, type NotaVenta, type ProyectoHist } from '../lib/backlogAnalisis'

// Historia del backlog para el análisis (solo en el servidor propio; la llena la sincronización horaria de
// ventas): proyectos con nota de venta, sus notas de venta y sus guías/devoluciones/facturas sin guía.

const PAGINA = 1000

function esTablaInexistente(err: { code?: string } | null): boolean {
  return err?.code === 'PGRST205' || err?.code === '42P01' || err?.code === 'PGRST202'
}

class SinHistoria extends Error {}

// PostgREST corta en max-rows: se pide por páginas hasta que una vuelva incompleta.
async function todas<T>(tabla: string, columnas: string, orden: string[]): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    let q = supabase.from(tabla).select(columnas)
    for (const o of orden) q = q.order(o)
    const { data, error } = await q.range(desde, desde + PAGINA - 1)
    if (esTablaInexistente(error)) throw new SinHistoria()
    if (error) throw new Error(error.message)
    filas.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGINA) return filas
  }
}

interface FilaProyecto {
  proyecto_codigo: string
  proyecto_nombre: string | null
  cliente_nombre: string | null
  linea: string | null
  sucursal: string | null
}
interface FilaNv {
  proyecto_codigo: string
  fecha: string
  cierre: string | null
  monto: number | string
}
interface FilaMov {
  proyecto_codigo: string
  fecha: string
  tipo: Movimiento['tipo']
  monto: number | string
}

export function useBacklogHistoria() {
  const [historia, setHistoria] = useState<Historia | null>(null)
  const [disponible, setDisponible] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      try {
        const [proyectos, nv, mov] = await Promise.all([
          todas<FilaProyecto>('sap_backlog_proyecto', 'proyecto_codigo, proyecto_nombre, cliente_nombre, linea, sucursal', ['proyecto_codigo']),
          todas<FilaNv>('sap_backlog_nv', 'proyecto_codigo, fecha, cierre, monto', ['doc_entry', 'proyecto_codigo']),
          todas<FilaMov>('sap_backlog_mov', 'proyecto_codigo, fecha, tipo, monto', ['proyecto_codigo', 'fecha', 'tipo']),
        ])
        if (cancelado) return
        const ps: ProyectoHist[] = proyectos.map((p) => ({
          codigo: p.proyecto_codigo,
          nombre: p.proyecto_nombre ? `${p.proyecto_codigo} · ${p.proyecto_nombre}` : p.proyecto_codigo,
          cliente: p.cliente_nombre,
          linea: p.linea,
          sucursal: p.sucursal,
        }))
        const ns: NotaVenta[] = nv.map((n) => ({ proyecto: n.proyecto_codigo, fecha: n.fecha, cierre: n.cierre, monto: Number(n.monto) }))
        const ms: Movimiento[] = mov.map((m) => ({ proyecto: m.proyecto_codigo, fecha: m.fecha, tipo: m.tipo, monto: Number(m.monto) }))
        setHistoria(armarHistoria(ps, ns, ms))
      } catch (e) {
        if (cancelado) return
        if (e instanceof SinHistoria) setDisponible(false)
        else setError(e instanceof Error ? e.message : 'No se pudo cargar la historia del backlog')
      } finally {
        if (!cancelado) setLoading(false)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [])

  return { historia, disponible, loading, error }
}

interface FilaFoto {
  fecha_pedida: string
  proyecto_codigo: string
  contratado: number | string
  despachado: number | string
  facturado_directo: number | string
}

/** Fotos diarias a las fechas pedidas (la foto de ese día o de hasta 6 días antes). Las fechas sin foto
 *  no aparecen en el resultado: ahí se usa la historia reconstruida. */
export function useFotosBacklog(fechas: string[]) {
  const clave = useMemo(() => [...new Set(fechas)].sort().join(','), [fechas])
  const [fotos, setFotos] = useState<Map<string, FotoProyecto[]>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelado = false
    const lista = clave ? clave.split(',') : []
    ;(async () => {
      setLoading(true)
      const mapa = new Map<string, FotoProyecto[]>()
      try {
        for (let desde = 0; lista.length > 0; desde += PAGINA) {
          const { data, error } = await supabase
            .rpc('sap_backlog_fotos', { p_fechas: lista })
            .order('fecha_pedida')
            .order('proyecto_codigo')
            .range(desde, desde + PAGINA - 1)
          if (error) break // sin la función (o sin fotos) todo sale de la historia reconstruida
          for (const f of (data ?? []) as FilaFoto[]) {
            const arr = mapa.get(f.fecha_pedida) ?? []
            arr.push({
              proyecto: f.proyecto_codigo,
              saldo: Number(f.contratado) - Number(f.despachado) - Number(f.facturado_directo),
            })
            mapa.set(f.fecha_pedida, arr)
          }
          if (!data || data.length < PAGINA) break
        }
      } finally {
        if (!cancelado) {
          setFotos(mapa)
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelado = true
    }
  }, [clave])

  return { fotos, loading }
}
