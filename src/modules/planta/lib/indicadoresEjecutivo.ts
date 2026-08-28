import type { useResumenData } from '../hooks/useResumenData'
import { fmt, fmtPr } from './format'

// ponytail: avance económico real del último mes fijado a 7% a pedido — el acumulado
// se recalcula sumando esta serie corregida en vez del valor calculado desde compras.
export const AVANCE_ECON_ULTIMO_MES_FIJO = 7

// ponytail: valores fijos a pedido, no calculados — ajustar acá si cambian.
export const MODULOS_PROYECTO_FIJO = 704
export const MODULOS_INICIADOS_FIJO = 214
export const MODULOS_EN_PROCESO_FIJO = 57
export const MONTO_CONTRATO_UF = 346909

type Resumen = ReturnType<typeof useResumenData>

// Indicadores oficiales de la pestaña Ejecutivo — reusados también en Resumen para que ambas pestañas muestren los mismos valores.
export function buildIndicadoresEjecutivo(resumen: Resumen) {
  const avanceEconomico = resumen.avanceEconomico.map((x, i) =>
    i === resumen.avanceEconomico.length - 1 ? { ...x, real: AVANCE_ECON_ULTIMO_MES_FIJO } : x,
  )
  let sumRealAcum = 0
  const avanceEconomicoAcumulado = resumen.avanceEconomicoAcumulado.map((x, i) => {
    const real = avanceEconomico[i]?.real
    if (real != null) sumRealAcum += real
    return { ...x, realAcum: real != null ? +sumRealAcum.toFixed(2) : x.realAcum }
  })

  const avanceEconomicoAcumFinal = avanceEconomicoAcumulado[avanceEconomicoAcumulado.length - 1]?.realAcum ?? null

  const items = [
    { label: 'Monto del contrato', value: `UF ${fmt(MONTO_CONTRATO_UF)}` },
    {
      label: 'Avance económico %',
      value: fmtPr(avanceEconomicoAcumFinal),
      tono: resumen.kpis.ejecucionSobrePresupuesto ? ('destructive' as const) : ('success' as const),
    },
    { label: 'Módulos del proyecto', value: fmt(MODULOS_PROYECTO_FIJO) },
    { label: 'Módulos iniciados', value: fmt(MODULOS_INICIADOS_FIJO) },
    { label: 'Módulos terminados', value: fmt(resumen.kpis.modulosTerminados), tono: 'success' as const },
    { label: 'Módulos despachados', value: fmt(resumen.kpis.modulosDespachados) },
    { label: 'Módulos en proceso', value: fmt(MODULOS_EN_PROCESO_FIJO), tono: 'warning' as const },
  ]

  return { avanceEconomico, avanceEconomicoAcumulado, avanceEconomicoAcumFinal, items }
}
