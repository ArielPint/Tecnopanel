import { useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { getProyectoId } from '@/lib/proyectoIds'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { useCatalogoGD } from '@/modules/logistica/hooks/useCatalogoGD'
import { loadCompras, loadDespachos, loadPlantaModulos, loadPresupuestoTotal, loadRegistroStock } from '../lib/supaData'
import {
  costoPorModulo, costoPorTorre, costoReal, proyectar, ritmoObservado, valorizarStock,
  type BasePrecio, type ModuloEstado, type ProductoReceta, type SerieMensualReal, type StockItem,
} from '../lib/proyeccionCostos'

const normCod = (c: string) => String(c || '').trim().toUpperCase()

interface ProyeccionSupaData {
  modulos: ModuloEstado[]
  /** Serie de compras reales por mes, del mismo loadCompras que usa la pestaña Compras. */
  serieReal: SerieMensualReal[]
  comprado: number
  /** Stock físico de la última semana cargada. */
  stock: StockItem[]
  stockSemana: string | null
  /** Módulos despachados por mes — base del ritmo observado. */
  serieDespachos: { fecha: Date; modulos: number }[]
  presupuestoTotal: number | null
}

async function fetchProyeccion(proyectoId: string): Promise<ProyeccionSupaData> {
  const [modulosRaw, compras, stockRaw, despachos, presupuestoTotal] = await Promise.all([
    loadPlantaModulos(proyectoId),
    loadCompras(proyectoId),
    loadRegistroStock(proyectoId),
    loadDespachos(proyectoId),
    loadPresupuestoTotal(),
  ])

  const modulos: ModuloEstado[] = modulosRaw.map((m) => ({
    torre: m.torre ?? '',
    terminado: m.estado_modulo === 'MODULO TERMINADO',
  }))

  const porMes = new Map<number, { fecha: Date; monto: number }>()
  let comprado = 0
  for (const c of compras) {
    comprado += c.valorTotal ?? 0
    if (c.anioGuia == null || c.mes == null) continue
    const fecha = new Date(c.anioGuia, c.mes - 1, 1)
    const k = fecha.getTime()
    const prev = porMes.get(k)
    if (prev) prev.monto += c.valorTotal ?? 0
    else porMes.set(k, { fecha, monto: c.valorTotal ?? 0 })
  }

  // loadRegistroStock viene ordenado por semana descendente: la primera es la vigente.
  const stockSemana = stockRaw[0]?.semana_key ?? null
  const stock: StockItem[] = stockRaw
    .filter((s) => s.semana_key === stockSemana)
    .map((s) => ({ codigo: normCod(s.codigo), cantidad: +s.stock_fisico || 0 }))

  const despMes = new Map<number, { fecha: Date; modulos: Set<string> }>()
  for (const d of despachos) {
    if (!d.fecha || !d.modulo) continue
    const f = new Date(d.fecha + 'T12:00:00')
    const fecha = new Date(f.getFullYear(), f.getMonth(), 1)
    const k = fecha.getTime()
    const prev = despMes.get(k)
    if (prev) prev.modulos.add(d.modulo)
    else despMes.set(k, { fecha, modulos: new Set([d.modulo]) })
  }

  return {
    modulos,
    serieReal: [...porMes.values()].sort((a, b) => a.fecha.getTime() - b.fecha.getTime()),
    comprado,
    stock,
    stockSemana,
    serieDespachos: [...despMes.values()]
      .map((v) => ({ fecha: v.fecha, modulos: v.modulos.size }))
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime()),
    presupuestoTotal,
  }
}

export interface UseProyeccionOptions {
  base: BasePrecio
  /** Módulos por mes elegido por el usuario. null = usar el ritmo observado. */
  ritmoManual: number | null
}

export function useProyeccionData({ base, ritmoManual }: UseProyeccionOptions) {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  // El catálogo es la fuente de la receta y de los tres precios — se reusa tal cual
  // en vez de duplicar la lógica de merge base/custom/ppto.
  const { allProducts, pppMap, statsMap, loading: loadingCatalogo, error: errorCatalogo } = useCatalogoGD()

  const fetcher = useCallback(async () => fetchProyeccion(await getProyectoId(proyectoSlug!)), [proyectoSlug])
  const { data, loading: loadingSupa, error: errorSupa } = useCachedQuery<ProyeccionSupaData>(
    proyectoSlug ? `proyeccion_data:${proyectoSlug}` : null,
    fetcher,
    5 * 60_000,
  )

  const productos = useMemo<ProductoReceta[]>(() => {
    return allProducts
      .filter((p) => p.cantidad_por_modulo != null && p.cantidad_por_modulo > 0)
      .map((p) => {
        const k = normCod(p.codigo)
        const ppp = pppMap[k]
        return {
          codigo: k,
          descripcion: p.descripcion,
          unidad: p.unidad || '',
          grupo: p.grupo || '',
          cantidadPorModulo: p.cantidad_por_modulo!,
          ppp: ppp && ppp.cant > 0 ? ppp.monto / ppp.cant : null,
          ppto: p.ppto,
          ultimo: statsMap[k]?.ultimoValor ?? null,
        }
      })
  }, [allProducts, pppMap, statsMap])

  return useMemo(() => {
    const modulos = data?.modulos ?? []
    const comprado = data?.comprado ?? 0
    const serieReal = data?.serieReal ?? []
    const serieDespachos = data?.serieDespachos ?? []

    const cm = costoPorModulo(productos, base)
    const modulosTotales = modulos.length
    const terminados = modulos.filter((m) => m.terminado).length
    const torres = costoPorTorre(modulos, cm.total)

    const stockValorizado = valorizarStock(data?.stock ?? [], productos, base)
    const real = costoReal(comprado, stockValorizado, terminados)

    const ritmoObs = ritmoObservado(serieDespachos, 3)
    const ritmo = ritmoManual ?? ritmoObs ?? 0

    const proy = proyectar({
      modulosTotales, terminados, ritmo, costoModulo: cm.total, comprado, serieReal,
    })
    // Misma proyección anclada en el costo real observado, para contrastar con la teórica.
    const proyReal = proyectar({
      modulosTotales, terminados, ritmo,
      costoModulo: real.porModuloAjustado ?? 0,
      comprado, serieReal,
    })

    const presupuestoTotal = data?.presupuestoTotal ?? null

    return {
      loading: loadingCatalogo || loadingSupa,
      error: errorCatalogo || errorSupa,
      base,
      costoModulo: cm,
      modulosTotales,
      terminados,
      restantes: modulosTotales - terminados,
      torres,
      real,
      stockSemana: data?.stockSemana ?? null,
      ritmo,
      ritmoObservado: ritmoObs,
      proyeccion: proy,
      proyeccionReal: proyReal,
      presupuestoTotal,
      /** Cuánto se desvía el teórico del real por módulo. null si falta uno de los dos. */
      brecha:
        real.porModuloAjustado != null && cm.total > 0
          ? { absoluta: real.porModuloAjustado - cm.total, relativa: real.porModuloAjustado / cm.total - 1 }
          : null,
    }
  }, [data, productos, base, ritmoManual, loadingCatalogo, loadingSupa, errorCatalogo, errorSupa])
}

export type ProyeccionData = ReturnType<typeof useProyeccionData>
