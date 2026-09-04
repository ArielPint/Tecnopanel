import type { Oportunidad, OportunidadHistorialEtapa, TareaIngenieria } from '@/modules/crm/types/database'

export const ETAPAS_TERMINALES = ['Ganado', 'Perdido']

const DIA_MS = 86400000
const SIN_ASIGNAR = '__sin_asignar__'
const SIN_FAMILIA = '__sin_familia__'

export function dias(desde: string, hasta: string | null): number {
  const fin = hasta ? new Date(hasta).getTime() : Date.now()
  return Math.max(0, Math.floor((fin - new Date(desde).getTime()) / DIA_MS))
}

export function prom(vals: number[]): number | null {
  if (!vals.length) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

export function mediana(vals: number[]): number | null {
  if (!vals.length) return null
  const s = [...vals].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

export const esTerminal = (o: Oportunidad) => ETAPAS_TERMINALES.includes(o.etapa_actual)

/** Fecha de cierre de una oportunidad terminal. `fecha_cierre_real` es lo declarado por
 *  ventas; si no esta, se usa updated_at, que es cuando el cierre quedo registrado. */
export function fechaCierre(o: Oportunidad): string | null {
  if (!esTerminal(o)) return null
  return o.fecha_cierre_real ?? o.updated_at
}

/** Dias de vida: para una oportunidad cerrada, el ciclo completo; para una activa, la
 *  antiguedad hasta hoy. */
export function diasOportunidad(o: Oportunidad): number {
  return dias(o.created_at, fechaCierre(o))
}

export interface ResumenOportunidades {
  total: number
  activas: number
  ganadas: number
  perdidas: number
  cicloProm: number | null
  cicloMediana: number | null
  cicloPromGanadas: number | null
  cicloPromPerdidas: number | null
  antiguedadPromActivas: number | null
  plazoPresentacionProm: number | null
  plazoPresentacionMediana: number | null
  conPresentacion: number
}

export function resumenOportunidades(opps: Oportunidad[]): ResumenOportunidades {
  const activas = opps.filter((o) => !esTerminal(o))
  const ganadas = opps.filter((o) => o.etapa_actual === 'Ganado')
  const perdidas = opps.filter((o) => o.etapa_actual === 'Perdido')
  const cerradas = [...ganadas, ...perdidas].map(diasOportunidad)
  const plazos = opps.map(plazoPresentacion).filter((d): d is number => d != null)
  return {
    total: opps.length,
    activas: activas.length,
    ganadas: ganadas.length,
    perdidas: perdidas.length,
    cicloProm: prom(cerradas),
    cicloMediana: mediana(cerradas),
    cicloPromGanadas: prom(ganadas.map(diasOportunidad)),
    cicloPromPerdidas: prom(perdidas.map(diasOportunidad)),
    antiguedadPromActivas: prom(activas.map(diasOportunidad)),
    plazoPresentacionProm: prom(plazos),
    plazoPresentacionMediana: mediana(plazos),
    conPresentacion: plazos.length,
  }
}

/** Dias entre la creacion de la oportunidad y la fecha de presentacion solicitada
 *  (`fecha_cierre_est`). Null cuando no hay fecha pedida. */
export function plazoPresentacion(o: Oportunidad): number | null {
  if (!o.fecha_cierre_est) return null
  return Math.round(
    (new Date(o.fecha_cierre_est).getTime() - new Date(o.created_at).getTime()) / DIA_MS,
  )
}

export interface FilaFamilia {
  familia: string
  total: number
  activas: number
  ganadas: number
  perdidas: number
  tasaConv: number | null
  cicloProm: number | null
  montoGanado: number
}

/** Corte por familia de producto. Una oportunidad con varias familias cuenta en cada una,
 *  asi que los totales por familia no suman el total del periodo. */
export function porFamiliaProducto(opps: Oportunidad[]): FilaFamilia[] {
  const by = new Map<string, Oportunidad[]>()
  opps.forEach((o) => {
    const familias = o.familia_productos?.length ? o.familia_productos : [SIN_FAMILIA]
    familias.forEach((f) => {
      const arr = by.get(f)
      if (arr) arr.push(o)
      else by.set(f, [o])
    })
  })
  return [...by.entries()]
    .map(([familia, os]) => {
      const ganadas = os.filter((o) => o.etapa_actual === 'Ganado')
      const perdidas = os.filter((o) => o.etapa_actual === 'Perdido')
      const cerradasN = ganadas.length + perdidas.length
      return {
        familia: familia === SIN_FAMILIA ? 'Sin familia' : familia,
        total: os.length,
        activas: os.filter((o) => !esTerminal(o)).length,
        ganadas: ganadas.length,
        perdidas: perdidas.length,
        tasaConv: cerradasN ? Math.round((ganadas.length / cerradasN) * 100) : null,
        cicloProm: prom([...ganadas, ...perdidas].map(diasOportunidad)),
        montoGanado: ganadas.reduce((s, o) => s + (o.monto_final ?? o.monto_estimado ?? 0), 0),
      }
    })
    .sort((a, b) => b.total - a.total)
}

export interface FilaEtapa {
  etapa: string
  tramos: number
  enCurso: number
  promDias: number | null
  medianaDias: number | null
  maxDias: number
}

/** Un "tramo" es un paso por la etapa (una fila de historial). Los tramos abiertos
 *  (sin fecha_salida) cuentan hasta hoy, igual que en el dashboard. */
export function porEtapa(hist: OportunidadHistorialEtapa[], orden: string[]): FilaEtapa[] {
  const byEtapa = new Map<string, OportunidadHistorialEtapa[]>()
  hist.forEach((h) => {
    const arr = byEtapa.get(h.etapa)
    if (arr) arr.push(h)
    else byEtapa.set(h.etapa, [h])
  })
  const etapas = [
    ...orden.filter((e) => byEtapa.has(e)),
    ...[...byEtapa.keys()].filter((e) => !orden.includes(e)),
  ]
  return etapas.map((etapa) => {
    const rows = byEtapa.get(etapa) ?? []
    const ds = rows.map((h) => dias(h.fecha_entrada, h.fecha_salida))
    return {
      etapa,
      tramos: rows.length,
      enCurso: rows.filter((h) => !h.fecha_salida).length,
      promDias: prom(ds),
      medianaDias: mediana(ds),
      maxDias: ds.length ? Math.max(...ds) : 0,
    }
  })
}

export interface FilaResponsable {
  usuarioId: string | null
  tramos: number
  promDias: number | null
  maxDias: number
}

export function responsablesDeEtapa(hist: OportunidadHistorialEtapa[], etapa: string): FilaResponsable[] {
  const by = new Map<string, OportunidadHistorialEtapa[]>()
  hist
    .filter((h) => h.etapa === etapa)
    .forEach((h) => {
      const k = h.usuario_id ?? SIN_ASIGNAR
      const arr = by.get(k)
      if (arr) arr.push(h)
      else by.set(k, [h])
    })
  return [...by.entries()]
    .map(([k, hs]) => {
      const ds = hs.map((h) => dias(h.fecha_entrada, h.fecha_salida))
      return {
        usuarioId: k === SIN_ASIGNAR ? null : k,
        tramos: hs.length,
        promDias: prom(ds),
        maxDias: ds.length ? Math.max(...ds) : 0,
      }
    })
    .sort((a, b) => (b.promDias ?? 0) - (a.promDias ?? 0))
}

/** Etapa en la que estaba la oportunidad cuando se creo la tarea. `tareas_ingenieria` no
 *  guarda la etapa, asi que se deduce del tramo de historial que contiene created_at.
 *  ponytail: heuristica sobre el historial; si la tarea es anterior al primer tramo
 *  devuelve null y la tarea queda fuera del corte por etapa. */
export function etapaDeTarea(t: TareaIngenieria, hist: OportunidadHistorialEtapa[]): string | null {
  const creada = new Date(t.created_at).getTime()
  const tramos = hist
    .filter((h) => h.oportunidad_id === t.oportunidad_id)
    .sort((a, b) => new Date(a.fecha_entrada).getTime() - new Date(b.fecha_entrada).getTime())
  let ultima: string | null = null
  for (const h of tramos) {
    if (new Date(h.fecha_entrada).getTime() > creada) break
    const salida = h.fecha_salida ? new Date(h.fecha_salida).getTime() : Infinity
    ultima = h.etapa
    if (creada <= salida) return h.etapa
  }
  return ultima
}

export interface FilaTareas {
  usuarioId: string
  total: number
  completadas: number
  rechazadas: number
  abiertas: number
  promDiasResolucion: number | null
  vencidas: number
}

/** Tareas agrupadas por asignado. `asignaciones` mapea tarea_id -> usuarios. Una tarea con
 *  N asignados cuenta para los N. */
export function tareasPorAsignado(
  tareas: TareaIngenieria[],
  asignaciones: Map<string, string[]>,
): FilaTareas[] {
  const by = new Map<string, TareaIngenieria[]>()
  tareas.forEach((t) => {
    ;(asignaciones.get(t.id) ?? []).forEach((u) => {
      const arr = by.get(u)
      if (arr) arr.push(t)
      else by.set(u, [t])
    })
  })
  const hoy = new Date().toISOString().slice(0, 10)
  return [...by.entries()]
    .map(([usuarioId, ts]) => {
      const resueltas = ts.filter((t) => t.completada_at ?? t.respondido_at)
      return {
        usuarioId,
        total: ts.length,
        completadas: ts.filter((t) => t.estado === 'completada').length,
        rechazadas: ts.filter((t) => t.estado === 'rechazada').length,
        abiertas: ts.filter((t) => t.estado !== 'completada' && t.estado !== 'rechazada').length,
        promDiasResolucion: prom(
          resueltas.map((t) => dias(t.created_at, (t.completada_at ?? t.respondido_at) as string)),
        ),
        vencidas: ts.filter((t) => t.fecha_limite && t.fecha_limite < hoy && t.estado !== 'completada').length,
      }
    })
    .sort((a, b) => b.total - a.total)
}

export interface FilaVendedor {
  vendedorId: string | null
  total: number
  activas: number
  ganadas: number
  perdidas: number
  tasaConv: number | null
  cicloProm: number | null
  antiguedadActivas: number | null
  montoGanado: number
}

export function porVendedor(opps: Oportunidad[]): FilaVendedor[] {
  const by = new Map<string, Oportunidad[]>()
  opps.forEach((o) => {
    const k = o.vendedor_id ?? SIN_ASIGNAR
    const arr = by.get(k)
    if (arr) arr.push(o)
    else by.set(k, [o])
  })
  return [...by.entries()]
    .map(([k, os]) => {
      const ganadas = os.filter((o) => o.etapa_actual === 'Ganado')
      const perdidas = os.filter((o) => o.etapa_actual === 'Perdido')
      const activas = os.filter((o) => !esTerminal(o))
      const cerradasN = ganadas.length + perdidas.length
      return {
        vendedorId: k === SIN_ASIGNAR ? null : k,
        total: os.length,
        activas: activas.length,
        ganadas: ganadas.length,
        perdidas: perdidas.length,
        tasaConv: cerradasN ? Math.round((ganadas.length / cerradasN) * 100) : null,
        cicloProm: prom([...ganadas, ...perdidas].map(diasOportunidad)),
        antiguedadActivas: prom(activas.map(diasOportunidad)),
        montoGanado: ganadas.reduce((s, o) => s + (o.monto_final ?? o.monto_estimado ?? 0), 0),
      }
    })
    .sort((a, b) => b.total - a.total)
}

export interface PuntoMes {
  mes: string
  creadas: number
  cerradas: number
  ganadas: number
  cicloProm: number | null
}

/** Serie mensual: creadas por mes de created_at, cerradas por mes de cierre. El ciclo
 *  promedio del mes es el de las oportunidades cerradas EN ese mes. */
export function tendenciaMensual(opps: Oportunidad[]): PuntoMes[] {
  const mesDe = (iso: string) => iso.slice(0, 7)
  const meses = new Map<string, { creadas: number; cerradas: Oportunidad[]; ganadas: number }>()
  const slot = (m: string) => {
    let s = meses.get(m)
    if (!s) {
      s = { creadas: 0, cerradas: [], ganadas: 0 }
      meses.set(m, s)
    }
    return s
  }
  opps.forEach((o) => {
    slot(mesDe(o.created_at)).creadas++
    const cierre = fechaCierre(o)
    if (cierre) {
      const s = slot(mesDe(cierre))
      s.cerradas.push(o)
      if (o.etapa_actual === 'Ganado') s.ganadas++
    }
  })
  return [...meses.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, s]) => ({
      mes,
      creadas: s.creadas,
      cerradas: s.cerradas.length,
      ganadas: s.ganadas,
      cicloProm: prom(s.cerradas.map(diasOportunidad)),
    }))
}
