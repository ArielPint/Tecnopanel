import { useMemo } from 'react'
import type { ParsedDashboardData } from '../lib/excelParser'
import { parseDate } from '../lib/format'
import { useDotacionMod } from './useDotacionMod'

export interface FilaProductividad {
  anio: number
  mes: number
  label: string
  /** m2 equivalentes ejecutados en el mes (CURVA, "M2 Avance Diario Real") */
  m2: number
  iniciados: number
  terminados: number
  personas: number
  diasHombre: number
  /** Costo empresa total del mes (incluye horas extras y bono) */
  costoEmpresa: number
  horasExtras: number
  bonoProduccion: number
  /** Cotizaciones y cargas del empleador que caen sobre las horas extras y el bono */
  cargasHheeBono: number
  /** Horas extras con la parte de cargas que les toca */
  horasExtrasConCargas: number
  /** Bono de producción con la parte de cargas que le toca */
  bonoConCargas: number
  /** Horas extras + bono + las cargas que generan */
  costoVariable: number
  /** Costo empresa sin horas extras, bono ni las cargas de ambos */
  costoBase: number
  /** $ de MOD por m2 ejecutado, sin horas extras ni bono */
  costoM2Base: number | null
  /** $ de MOD por m2 ejecutado, costo empresa completo */
  costoM2: number | null
  /** m2 por persona (headcount del mes) */
  m2Persona: number | null
  /** m2 por día-hombre trabajado */
  m2DiaHombre: number | null
  /** costo empresa promedio por persona */
  costoPersona: number | null
}

const MES_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const div = (a: number, b: number) => (b > 0 ? a / b : null)

export function useProductividadData(excelData: ParsedDashboardData | null) {
  const { filas: dotacion, loading, error } = useDotacionMod()

  return useMemo(() => {
    // m2/iniciados/terminados por mes desde la hoja CURVA del Excel
    const porMes = new Map<string, { anio: number; mes: number; m2: number; iniciados: number; terminados: number }>()
    for (const r of excelData?.curva ?? []) {
      const d = parseDate(r.fecha)
      if (!d) continue
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`
      const acc = porMes.get(key) ?? { anio: d.getFullYear(), mes: d.getMonth() + 1, m2: 0, iniciados: 0, terminados: 0 }
      acc.m2 += r.m2RealDiario ?? 0
      acc.iniciados += r.iniciados ?? 0
      acc.terminados += r.terminados ?? 0
      porMes.set(key, acc)
    }

    const claves = new Set<string>([
      ...[...porMes.values()].filter((m) => m.m2 > 0 || m.iniciados > 0 || m.terminados > 0).map((m) => `${m.anio}-${m.mes}`),
      ...dotacion.map((d) => `${d.anio}-${d.mes}`),
    ])

    const filas: FilaProductividad[] = [...claves]
      .map((k) => {
        const [anio, mes] = k.split('-').map(Number)
        const c = porMes.get(k)
        const d = dotacion.find((x) => x.anio === anio && x.mes === mes)
        const m2 = c?.m2 ?? 0
        const personas = d?.personas ?? 0
        const diasHombre = d?.dias_hombre ?? 0
        const costoEmpresa = d?.costo_empresa ?? 0
        const horasExtras = d?.horas_extras ?? 0
        const bonoProduccion = d?.bono_produccion ?? 0
        // Las cargas del empleador se prorratean en el parser por (HHEE + bono) /
        // total imponible, así que el corte es exacto: lo variable se lleva las
        // cotizaciones que genera y no ensucia el costo base.
        const cargasHheeBono = d?.cargas_hhee_bono ?? 0
        const costoVariable = costoEmpresa > 0 ? horasExtras + bonoProduccion + cargasHheeBono : 0
        // Las cargas se muestran repartidas dentro de cada concepto, en proporción
        // a su monto, para que la fila cuadre sin una columna extra.
        const varSinCargas = horasExtras + bonoProduccion
        const horasExtrasConCargas = varSinCargas > 0 ? horasExtras + (cargasHheeBono * horasExtras) / varSinCargas : horasExtras
        const bonoConCargas = varSinCargas > 0 ? bonoProduccion + (cargasHheeBono * bonoProduccion) / varSinCargas : bonoProduccion
        const costoBase = costoEmpresa > 0 ? costoEmpresa - costoVariable : 0
        return {
          anio,
          mes,
          label: `${MES_ABR[mes - 1]} ${anio}`,
          m2,
          iniciados: c?.iniciados ?? 0,
          terminados: c?.terminados ?? 0,
          personas,
          diasHombre,
          costoEmpresa,
          horasExtras,
          bonoProduccion,
          cargasHheeBono,
          horasExtrasConCargas,
          bonoConCargas,
          costoVariable,
          costoBase,
          costoM2Base: div(costoBase, m2),
          costoM2: div(costoEmpresa, m2),
          m2Persona: div(m2, personas),
          m2DiaHombre: div(m2, diasHombre),
          costoPersona: div(costoEmpresa, personas),
        }
      })
      .sort((a, b) => a.anio - b.anio || a.mes - b.mes)

    const conDotacion = filas.filter((f) => f.costoEmpresa > 0)
    const t = {
      m2: conDotacion.reduce((s, f) => s + f.m2, 0),
      costoEmpresa: conDotacion.reduce((s, f) => s + f.costoEmpresa, 0),
      horasExtras: conDotacion.reduce((s, f) => s + f.horasExtras, 0),
      bonoProduccion: conDotacion.reduce((s, f) => s + f.bonoProduccion, 0),
      cargasHheeBono: conDotacion.reduce((s, f) => s + f.cargasHheeBono, 0),
      horasExtrasConCargas: conDotacion.reduce((s, f) => s + f.horasExtrasConCargas, 0),
      bonoConCargas: conDotacion.reduce((s, f) => s + f.bonoConCargas, 0),
      costoVariable: conDotacion.reduce((s, f) => s + f.costoVariable, 0),
      costoBase: conDotacion.reduce((s, f) => s + f.costoBase, 0),
      diasHombre: conDotacion.reduce((s, f) => s + f.diasHombre, 0),
      terminados: conDotacion.reduce((s, f) => s + f.terminados, 0),
      meses: conDotacion.length,
    }
    const totales = {
      ...t,
      // personas: promedio de dotación de los meses cargados, no una suma (una misma
      // persona aparece todos los meses).
      personas: t.meses > 0 ? conDotacion.reduce((s, f) => s + f.personas, 0) / t.meses : 0,
      costoM2: div(t.costoEmpresa, t.m2),
      costoM2Base: div(t.costoBase, t.m2),
      m2DiaHombre: div(t.m2, t.diasHombre),
    }

    const mesesSinDotacion = filas.filter((f) => f.m2 > 0 && f.costoEmpresa === 0).map((f) => f.label)

    return { filas, totales, mesesSinDotacion, loading, error }
  }, [excelData, dotacion, loading, error])
}
