import type { useResumenData } from '../hooks/useResumenData'
import { fmt, fmtPr } from './format'

// ponytail: unico valor fijo — el monto del contrato esta en UF y no existe en la base.
// No confundir con estados_pago_ingresos_config.monto_contractual, que es el anticipo
// cobrado del proyecto (en pesos). Ajustar aca si el contrato cambia.
export const MONTO_CONTRATO_UF = 346909

type Resumen = ReturnType<typeof useResumenData>

// Indicadores oficiales de la pestaña Ejecutivo — reusados también en Resumen para que ambas pestañas muestren los mismos valores.
export function buildIndicadoresEjecutivo(resumen: Resumen) {
  const { avanceEconomico, avanceEconomicoAcumulado } = resumen
  const avanceEconomicoAcumFinal = avanceEconomicoAcumulado[avanceEconomicoAcumulado.length - 1]?.realAcum ?? null

  const items = [
    { label: 'Monto del contrato', value: `UF ${fmt(MONTO_CONTRATO_UF)}` },
    {
      label: 'Avance económico %',
      value: fmtPr(avanceEconomicoAcumFinal),
      tono: resumen.kpis.ejecucionSobrePresupuesto ? ('destructive' as const) : ('success' as const),
    },
    { label: 'Módulos del proyecto', value: fmt(resumen.kpis.totalModulos) },
    { label: 'Módulos iniciados', value: fmt(resumen.kpis.modulosIniciados) },
    { label: 'Módulos terminados', value: fmt(resumen.kpis.modulosTerminados), tono: 'success' as const },
    { label: 'Módulos despachados', value: fmt(resumen.kpis.modulosDespachados) },
    { label: 'Módulos en proceso', value: fmt(resumen.kpis.modulosEnProceso), tono: 'warning' as const },
  ]

  return { avanceEconomico, avanceEconomicoAcumulado, avanceEconomicoAcumFinal, items }
}
