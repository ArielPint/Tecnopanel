import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export interface Vencimiento {
  fecha: string
  fuente: string
  descripcion: string
  ruta?: string
}

const DIAS_RANGO = 90

function rangoFechas() {
  const hoy = new Date()
  const hasta = new Date(hoy)
  hasta.setDate(hasta.getDate() + DIAS_RANGO)
  return { desde: hoy.toISOString().slice(0, 10), hasta: hasta.toISOString().slice(0, 10) }
}

async function vencimientosCrm(): Promise<Vencimiento[]> {
  const { desde, hasta } = rangoFechas()
  const [{ data: oportunidades }, { data: tareas }] = await Promise.all([
    supabase
      .from('oportunidades')
      .select('id, codigo, nombre, fecha_cierre_est, fecha_adjudicacion_est, fecha_inicio_despachos_est')
      .or(
        [
          `fecha_cierre_est.gte.${desde},fecha_cierre_est.lte.${hasta}`,
          `fecha_adjudicacion_est.gte.${desde},fecha_adjudicacion_est.lte.${hasta}`,
          `fecha_inicio_despachos_est.gte.${desde},fecha_inicio_despachos_est.lte.${hasta}`,
        ].join(','),
      ),
    supabase.from('tareas_ingenieria').select('id, titulo, descripcion, fecha_limite').gte('fecha_limite', desde).lte('fecha_limite', hasta),
  ])

  const filas: Vencimiento[] = []
  for (const o of oportunidades ?? []) {
    const nombre = `${o.codigo ?? ''} — ${o.nombre ?? ''}`.replace(/^— /, '')
    if (o.fecha_cierre_est) filas.push({ fecha: o.fecha_cierre_est, fuente: 'Oportunidad · Cierre est.', descripcion: nombre, ruta: '/crm/oportunidades' })
    if (o.fecha_adjudicacion_est)
      filas.push({ fecha: o.fecha_adjudicacion_est, fuente: 'Oportunidad · Adjudicación est.', descripcion: nombre, ruta: '/crm/oportunidades' })
    if (o.fecha_inicio_despachos_est)
      filas.push({ fecha: o.fecha_inicio_despachos_est, fuente: 'Oportunidad · Inicio despachos est.', descripcion: nombre, ruta: '/crm/oportunidades' })
  }
  for (const t of tareas ?? []) {
    if (t.fecha_limite) filas.push({ fecha: t.fecha_limite, fuente: 'Tarea Ingeniería', descripcion: t.titulo ?? t.descripcion ?? '', ruta: '/crm/oportunidades' })
  }
  return filas
}

async function vencimientosProyecto(proyectoId: string, proyectoSlug: string): Promise<Vencimiento[]> {
  const { desde, hasta } = rangoFechas()
  const [{ data: ep }, { data: pedidos }, { data: despachos }] = await Promise.all([
    supabase
      .from('estados_pago')
      .select('id, numero_ep, fecha_emision, fecha_recepcion')
      .eq('proyecto_id', proyectoId)
      .or([`fecha_emision.gte.${desde},fecha_emision.lte.${hasta}`, `fecha_recepcion.gte.${desde},fecha_recepcion.lte.${hasta}`].join(',')),
    supabase.from('pedidos').select('id, nombre, fecha_requerida').eq('proyecto_id', proyectoId).gte('fecha_requerida', desde).lte('fecha_requerida', hasta),
    supabase
      .from('despachos_gd')
      .select('id, gd_numero, modulo, torre, fecha_despacho')
      .eq('proyecto_id', proyectoId)
      .gte('fecha_despacho', desde)
      .lte('fecha_despacho', hasta),
  ])

  const filas: Vencimiento[] = []
  const rutaEP = `/proyectos/${proyectoSlug}/estados-pago`
  const rutaLogistica = `/proyectos/${proyectoSlug}/logistica`
  for (const e of ep ?? []) {
    const desc = `EP ${e.numero_ep}`
    if (e.fecha_emision) filas.push({ fecha: e.fecha_emision, fuente: 'Estado de Pago · Emisión', descripcion: desc, ruta: rutaEP })
    if (e.fecha_recepcion) filas.push({ fecha: e.fecha_recepcion, fuente: 'Estado de Pago · Recepción', descripcion: desc, ruta: rutaEP })
  }
  for (const p of pedidos ?? []) {
    if (p.fecha_requerida) filas.push({ fecha: p.fecha_requerida, fuente: 'Pedido', descripcion: p.nombre ?? '', ruta: rutaLogistica })
  }
  for (const d of despachos ?? []) {
    if (d.fecha_despacho)
      filas.push({
        fecha: d.fecha_despacho,
        fuente: 'Despacho GD',
        descripcion: [d.gd_numero, d.modulo, d.torre].filter(Boolean).join(' · '),
        ruta: rutaLogistica,
      })
  }
  return filas
}

interface Estado {
  vencimientos: Vencimiento[]
  loading: boolean
  error: string | null
}

// v1 de Calendarización (§3.6.2): agregador de solo lectura sobre 6 columnas de fecha ya
// existentes, sin tabla/vista nueva — 6 queries en paralelo, fusionadas y ordenadas acá.
// Distinto patrón que Reportes (esas vistas ya venían calculadas por Supabase); acá no hay
// nada que exponer, hay que ensamblarlo.
export function useProximosVencimientos(contexto: { tipo: 'crm' } | { tipo: 'proyecto'; proyectoId: string; proyectoSlug: string } | null): Estado {
  const [estado, setEstado] = useState<Estado>({ vencimientos: [], loading: false, error: null })

  const refetch = useCallback(async () => {
    if (!contexto) {
      setEstado({ vencimientos: [], loading: false, error: null })
      return
    }
    setEstado((s) => ({ ...s, loading: true, error: null }))
    try {
      const filas =
        contexto.tipo === 'crm' ? await vencimientosCrm() : await vencimientosProyecto(contexto.proyectoId, contexto.proyectoSlug)
      filas.sort((a, b) => a.fecha.localeCompare(b.fecha))
      setEstado({ vencimientos: filas, loading: false, error: null })
    } catch (err) {
      setEstado({ vencimientos: [], loading: false, error: err instanceof Error ? err.message : 'Error al cargar vencimientos' })
    }
  }, [contexto?.tipo, contexto?.tipo === 'proyecto' ? contexto.proyectoId : null])

  useEffect(() => {
    refetch()
  }, [refetch])

  return estado
}
