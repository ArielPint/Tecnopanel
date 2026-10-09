import { cargarXLSX } from '@/lib/cargarLibrerias'
import { supabase, unwrap } from '@/lib/supabaseClient'
import { nombreParaStorage } from '@/lib/storageKey'
import { comprimirImagen } from './imagen'

// Accidentes e incidentes (fase 6). Archivos (fotos, DIAT, informe) en el bucket 'sso', carpeta
// eventos/<evento_id>/. Mutual: Mutual de Seguridad CChC.

export const MUTUAL = 'Mutual de Seguridad CChC'

export const TIPOS_EVENTO = [
  { key: 'accidente_ctp', label: 'Accidente con tiempo perdido', corto: 'Accidente CTP' },
  { key: 'accidente_stp', label: 'Accidente sin tiempo perdido', corto: 'Accidente STP' },
  { key: 'trayecto', label: 'Accidente de trayecto', corto: 'Trayecto' },
  { key: 'enfermedad', label: 'Enfermedad profesional', corto: 'Enf. profesional' },
  { key: 'incidente', label: 'Incidente (daño material, sin lesionados)', corto: 'Incidente' },
  { key: 'casi_accidente', label: 'Casi-accidente (pudo haber lesión)', corto: 'Casi-accidente' },
] as const
export type TipoEvento = (typeof TIPOS_EVENTO)[number]['key']
export const TIPO_EVENTO = Object.fromEntries(TIPOS_EVENTO.map((t) => [t.key, t])) as Record<TipoEvento, (typeof TIPOS_EVENTO)[number]>

/** Tipos con persona lesionada (llevan afectado, lesión, Mutual). */
export const CON_LESION: TipoEvento[] = ['accidente_ctp', 'accidente_stp', 'trayecto', 'enfermedad']

export type Gravedad = 'leve' | 'grave' | 'fatal'
export type EstadoEvento = 'reportado' | 'en_investigacion' | 'cerrado'
export const ESTADO_EVENTO: Record<EstadoEvento, { label: string; clase: string }> = {
  reportado: { label: 'Reportado', clase: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' },
  en_investigacion: { label: 'En investigación', clase: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  cerrado: { label: 'Cerrado', clase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
}

export interface Evento {
  id: string
  numero: number
  tipo: TipoEvento
  gravedad: Gravedad
  ocurrido_en: string
  area_id: string | null
  lugar: string | null
  descripcion: string
  trabajador_id: string | null
  empresa_id: string | null
  testigos: string | null
  lesion: string | null
  parte_cuerpo: string | null
  dias_perdidos: number
  fecha_alta: string | null
  diat_folio: string | null
  diat_fecha: string | null
  autoridad_notificada_en: string | null
  estado: EstadoEvento
  causas_inmediatas: string | null
  causas_basicas: string | null
  investigado_por: string | null
  cerrado_por: string | null
  cerrado_en: string | null
  reportado_por: string | null
  created_at: string
  updated_at: string
}

export interface EventoV extends Evento {
  fecha: string
  empresa: string | null
  empresa_propia: boolean | null
  con_tiempo_perdido: boolean
  medidas: number
  medidas_pendientes: number
}

export interface Dotacion {
  mes: string
  empresa_id: string
  trabajadores: number
  horas_hombre: number
}

export type FichaEvento = Partial<Omit<Evento, 'id' | 'numero' | 'created_at' | 'updated_at' | 'cerrado_por' | 'cerrado_en'>>

// ---------------------------------------------------------------- eventos

export async function listarEventos(trabajadorId?: string): Promise<EventoV[]> {
  let q = supabase.from('sso_eventos_v').select('*')
  if (trabajadorId) q = q.eq('trabajador_id', trabajadorId)
  return (await unwrap(q.order('ocurrido_en', { ascending: false }))) as EventoV[]
}

export async function obtenerEvento(id: string): Promise<EventoV | null> {
  return (await unwrap(supabase.from('sso_eventos_v').select('*').eq('id', id).maybeSingle())) as EventoV | null
}

export async function guardarEvento(id: string | null, ficha: FichaEvento): Promise<string> {
  if (id) {
    await unwrap(supabase.from('sso_eventos').update(ficha).eq('id', id))
    return id
  }
  return ((await unwrap(supabase.from('sso_eventos').insert(ficha).select('id').single())) as { id: string }).id
}

export async function eliminarEvento(id: string): Promise<void> {
  const archivos = await listarArchivos(id)
  if (archivos.length) await supabase.storage.from('sso').remove(archivos.map((a) => a.path))
  await unwrap(supabase.from('sso_eventos').delete().eq('id', id))
}

export async function agregarMedida(eventoId: string, descripcion: string, responsable: string, plazo: string): Promise<string> {
  const { data, error } = await supabase.rpc('sso_evento_agregar_medida', {
    p_evento_id: eventoId,
    p_descripcion: descripcion,
    p_responsable: responsable,
    p_plazo: plazo,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export interface MedidaResumen {
  id: string
  numero: number
  descripcion: string
  estado: string
  fecha_compromiso: string
  responsable_user_id: string
  vencido: boolean
}

/** Medidas (hallazgos) del evento. Las ve quien tiene Hallazgos; sin ese módulo vuelve vacío. */
export async function listarMedidas(eventoId: string): Promise<MedidaResumen[]> {
  return (await unwrap(
    supabase.from('sso_hallazgos_v').select('id, numero, descripcion, estado, fecha_compromiso, responsable_user_id, vencido').eq('origen_evento_id', eventoId).order('numero'),
  )) as MedidaResumen[]
}

// ---------------------------------------------------------------- archivos

export interface ArchivoEvento {
  path: string
  nombre: string
}

export async function listarArchivos(eventoId: string): Promise<ArchivoEvento[]> {
  const { data, error } = await supabase.storage.from('sso').list(`eventos/${eventoId}`, { limit: 100, sortBy: { column: 'name', order: 'asc' } })
  if (error) return []
  return (data ?? []).filter((f) => f.id).map((f) => ({ path: `eventos/${eventoId}/${f.name}`, nombre: f.name.replace(/^\d+-/, '') }))
}

export async function subirArchivo(eventoId: string, archivo: File): Promise<void> {
  const final = archivo.type.startsWith('image/') ? await comprimirImagen(archivo) : archivo
  const { error } = await supabase.storage.from('sso').upload(`eventos/${eventoId}/${Date.now()}-${nombreParaStorage(final.name)}`, final, { contentType: final.type })
  if (error) throw new Error(error.message)
}

export async function urlArchivo(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('sso').createSignedUrl(path, 600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

// ---------------------------------------------------------------- dotación

export async function listarDotacion(): Promise<Dotacion[]> {
  return (await unwrap(supabase.from('sso_dotacion_mensual').select('mes, empresa_id, trabajadores, horas_hombre').order('mes'))) as Dotacion[]
}

export async function guardarDotacion(d: Dotacion): Promise<void> {
  await unwrap(supabase.from('sso_dotacion_mensual').upsert(d, { onConflict: 'mes,empresa_id' }))
}

export async function borrarDotacion(mes: string, empresaId: string): Promise<void> {
  await unwrap(supabase.from('sso_dotacion_mensual').delete().eq('mes', mes).eq('empresa_id', empresaId))
}

// ---------------------------------------------------------------- tasas (Ley 16.744)

export interface Tasas {
  meses: string[]
  /** meses del período sin dotación cargada: las tasas quedan subestimadas o vacías */
  mesesSinDotacion: string[]
  accidentes: number
  diasPerdidos: number
  dotacionPromedio: number | null
  horasHombre: number
  accidentabilidad: number | null
  siniestralidad: number | null
  frecuencia: number | null
  gravedad: number | null
}

export function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = []
  let a = +desde.slice(0, 4)
  let m = +desde.slice(5, 7)
  while (`${a}-${String(m).padStart(2, '0')}` <= hasta.slice(0, 7)) {
    out.push(`${a}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      a++
    }
  }
  return out
}

/** Tasas de una empresa en un período de meses ('AAAA-MM'). Solo accidentes con tiempo perdido y
 *  enfermedades profesionales (sin trayecto ni incidentes). Dotación = promedio de los meses cargados. */
export function calcularTasas(eventos: EventoV[], dotacion: Dotacion[], empresaId: string, meses: string[]): Tasas {
  const enPeriodo = eventos.filter((e) => e.empresa_id === empresaId && e.con_tiempo_perdido && meses.includes(e.fecha.slice(0, 7)))
  const dot = dotacion.filter((d) => d.empresa_id === empresaId && meses.includes(d.mes.slice(0, 7)))
  const accidentes = enPeriodo.length
  const diasPerdidos = enPeriodo.reduce((s, e) => s + e.dias_perdidos, 0)
  const dotacionPromedio = dot.length ? dot.reduce((s, d) => s + Number(d.trabajadores), 0) / dot.length : null
  const horasHombre = dot.reduce((s, d) => s + Number(d.horas_hombre), 0)
  const r1 = (x: number) => Math.round(x * 100) / 100
  return {
    meses,
    mesesSinDotacion: meses.filter((m) => !dot.some((d) => d.mes.startsWith(m))),
    accidentes,
    diasPerdidos,
    dotacionPromedio,
    horasHombre,
    accidentabilidad: dotacionPromedio ? r1((accidentes / dotacionPromedio) * 100) : null,
    siniestralidad: dotacionPromedio ? r1((diasPerdidos / dotacionPromedio) * 100) : null,
    frecuencia: horasHombre ? r1((accidentes * 1_000_000) / horasHombre) : null,
    gravedad: horasHombre ? r1((diasPerdidos * 1_000_000) / horasHombre) : null,
  }
}

/** Días desde el último accidente con tiempo perdido de la empresa (null si nunca hubo). */
export function diasSinAccidentes(eventos: EventoV[], empresaId: string, hoy: string): number | null {
  const ultimo = eventos.filter((e) => e.empresa_id === empresaId && e.con_tiempo_perdido).map((e) => e.fecha).sort().pop()
  if (!ultimo) return null
  return Math.round((Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10)) - Date.UTC(+ultimo.slice(0, 4), +ultimo.slice(5, 7) - 1, +ultimo.slice(8, 10))) / 86_400_000)
}

// ---------------------------------------------------------------- Excel

export async function exportarEventosExcel(eventos: EventoV[], nombres: { trabajador: (id: string | null) => string; area: (id: string | null) => string }) {
  const XLSX = await cargarXLSX()
  const serial = (f: string) => (Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86_400_000
  const filas = eventos.map((e) => ({
    'N°': e.numero,
    Fecha: serial(e.fecha),
    Tipo: TIPO_EVENTO[e.tipo].label,
    Gravedad: e.gravedad,
    Empresa: e.empresa ?? '',
    Afectado: nombres.trabajador(e.trabajador_id),
    Área: e.area_id ? nombres.area(e.area_id) : '',
    Lugar: e.lugar ?? '',
    Descripción: e.descripcion,
    Lesión: e.lesion ?? '',
    'Parte del cuerpo': e.parte_cuerpo ?? '',
    'Días perdidos': e.dias_perdidos,
    'Folio DIAT/DIEP': e.diat_folio ?? '',
    'Causas inmediatas': e.causas_inmediatas ?? '',
    'Causas básicas': e.causas_basicas ?? '',
    Medidas: e.medidas,
    Estado: ESTADO_EVENTO[e.estado].label,
  }))
  const hoja = XLSX.utils.json_to_sheet(filas)
  for (let r = 1; r <= filas.length; r++) {
    const c = hoja[XLSX.utils.encode_cell({ r, c: 1 })]
    if (c && typeof c.v === 'number') c.z = 'dd-mm-yyyy'
  }
  hoja['!cols'] = [6, 12, 28, 9, 22, 28, 24, 20, 50, 24, 18, 8, 14, 40, 40, 8, 16].map((wch) => ({ wch }))
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Eventos')
  const sello = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
  XLSX.writeFile(libro, `prevencion-accidentes-${sello}.xlsx`)
}
