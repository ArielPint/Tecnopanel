import { hoyChile } from './estados'
import type { Area, Hallazgo } from './tipos'

// Cálculos del panel de indicadores (requisito 13). Funciones puras: la pantalla y las
// exportaciones a Excel/PDF usan exactamente las mismas cifras.
//
// Criterio de fechas: "reportado" cuenta por fecha_deteccion y "cerrado" por la fecha de cierre
// en hora de Chile. Los pendientes son una foto de hoy y no dependen del período.

export type Periodo = '12m' | 'anio' | 'todo'

export const PERIODOS: { key: Periodo; label: string }[] = [
  { key: '12m', label: 'Últimos 12 meses' },
  { key: 'anio', label: 'Este año' },
  { key: 'todo', label: 'Todo' },
]

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function fechaCierreChile(h: Hallazgo): string | null {
  return h.fecha_cierre ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(h.fecha_cierre)) : null
}

function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10))
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

/** Primer día del período, 'YYYY-MM-DD'. */
export function inicioPeriodo(periodo: Periodo, hallazgos: Hallazgo[]): string {
  const hoy = hoyChile()
  if (periodo === 'anio') return `${hoy.slice(0, 4)}-01-01`
  if (periodo === '12m') {
    const a = +hoy.slice(0, 4)
    const m = +hoy.slice(5, 7) - 11
    const f = new Date(Date.UTC(a, m - 1, 1))
    return f.toISOString().slice(0, 10)
  }
  const primero = hallazgos.reduce((min, h) => (h.fecha_deteccion < min ? h.fecha_deteccion : min), hoy)
  return `${primero.slice(0, 7)}-01`
}

function mesesDesde(inicio: string, hasta: string): string[] {
  const meses: string[] = []
  let a = +inicio.slice(0, 4)
  let m = +inicio.slice(5, 7)
  const fin = hasta.slice(0, 7)
  for (;;) {
    const key = `${a}-${String(m).padStart(2, '0')}`
    meses.push(key)
    if (key >= fin) break
    m++
    if (m > 12) {
      m = 1
      a++
    }
  }
  return meses
}

export function etiquetaMes(key: string): string {
  return `${MESES_CORTOS[+key.slice(5, 7) - 1]} ${key.slice(2, 4)}`
}

export interface FilaArea {
  areaId: string | null
  area: string
  reportados: number
  pendientes: number
  vencidos: number
  cerrados: number
  cerradosEnPlazo: number
  /** null si no hubo cierres en el período */
  pctEnPlazo: number | null
}

export interface Indicadores {
  desde: string
  hasta: string
  pendientes: number
  porEstado: { abierto: number; en_proceso: number; pend_verificacion: number }
  vencidos: number
  reportados: number
  cerrados: number
  cerradosEnPlazo: number
  pctEnPlazo: number | null
  diasPromedioCierre: number | null
  tendencia: { mes: string; label: string; reportados: number; cerrados: number }[]
  porArea: FilaArea[]
}

export function calcularIndicadores(hallazgos: Hallazgo[], areas: Area[], periodo: Periodo, areaId: string): Indicadores {
  const hasta = hoyChile()
  const desde = inicioPeriodo(periodo, hallazgos)
  const base = areaId ? hallazgos.filter((h) => h.area_id === areaId) : hallazgos

  const pendientesLista = base.filter((h) => h.estado !== 'cerrado')
  const reportadosLista = base.filter((h) => h.fecha_deteccion >= desde && h.fecha_deteccion <= hasta)
  const cerradosLista = base.filter((h) => {
    const f = fechaCierreChile(h)
    return f !== null && f >= desde && f <= hasta
  })
  const enPlazo = cerradosLista.filter((h) => h.cerrado_en_plazo).length
  const diasCierre = cerradosLista.map((h) => diasEntre(h.fecha_deteccion, fechaCierreChile(h)!))

  const meses = mesesDesde(desde, hasta)
  const tendencia = meses.map((mes) => ({
    mes,
    label: etiquetaMes(mes),
    reportados: reportadosLista.filter((h) => h.fecha_deteccion.startsWith(mes)).length,
    cerrados: cerradosLista.filter((h) => fechaCierreChile(h)!.startsWith(mes)).length,
  }))

  const nombres = new Map(areas.map((a) => [a.id, a.nombre]))
  const claves = new Set<string | null>([...reportadosLista, ...pendientesLista, ...cerradosLista].map((h) => h.area_id))
  const porArea: FilaArea[] = [...claves]
    .map((id) => {
      const de = (l: Hallazgo[]) => l.filter((h) => h.area_id === id)
      const cerr = de(cerradosLista)
      const ok = cerr.filter((h) => h.cerrado_en_plazo).length
      return {
        areaId: id,
        area: id ? nombres.get(id) ?? '—' : 'Sin área',
        reportados: de(reportadosLista).length,
        pendientes: de(pendientesLista).length,
        vencidos: de(pendientesLista).filter((h) => h.vencido).length,
        cerrados: cerr.length,
        cerradosEnPlazo: ok,
        pctEnPlazo: cerr.length ? Math.round((ok / cerr.length) * 100) : null,
      }
    })
    .sort((a, b) => b.reportados - a.reportados || b.pendientes - a.pendientes || a.area.localeCompare(b.area))

  return {
    desde,
    hasta,
    pendientes: pendientesLista.length,
    porEstado: {
      abierto: pendientesLista.filter((h) => h.estado === 'abierto').length,
      en_proceso: pendientesLista.filter((h) => h.estado === 'en_proceso').length,
      pend_verificacion: pendientesLista.filter((h) => h.estado === 'pend_verificacion').length,
    },
    vencidos: pendientesLista.filter((h) => h.vencido).length,
    reportados: reportadosLista.length,
    cerrados: cerradosLista.length,
    cerradosEnPlazo: enPlazo,
    pctEnPlazo: cerradosLista.length ? Math.round((enPlazo / cerradosLista.length) * 100) : null,
    diasPromedioCierre: diasCierre.length ? Math.round((diasCierre.reduce((a, b) => a + b, 0) / diasCierre.length) * 10) / 10 : null,
    tendencia,
    porArea,
  }
}
