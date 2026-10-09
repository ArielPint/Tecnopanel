import { cargarXLSX } from '@/lib/cargarLibrerias'
import { supabase, unwrap } from '@/lib/supabaseClient'
import { nombreParaStorage } from '@/lib/storageKey'
import type { UsuarioSso } from './tipos'

// Comité Paritario de Higiene y Seguridad (fase 8, DS 54): comités con su periodo, integrantes,
// reuniones con asistencia y acta, acuerdos con seguimiento. Actas en el bucket 'sso', carpeta
// comite/<reunion_id>/.

export const ARCHIVOS_ACTA = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
export const TAMANO_ACTA_MB = 25

export interface Comite {
  id: string
  nombre: string
  faena: string | null
  periodo_desde: string
  periodo_hasta: string
  activo: boolean
  observaciones: string | null
}

export interface ComiteV extends Comite {
  periodo_vencido: boolean
  titulares_empresa: number
  titulares_trabajadores: number
  ultima_ordinaria: string | null
  proxima_reunion: string | null
  acuerdos_pendientes: number
  acuerdos_vencidos: number
}

export type Representa = 'empresa' | 'trabajadores'
export type Calidad = 'titular' | 'suplente'
export type CargoComite = 'presidente' | 'secretario'

export interface Miembro {
  id: string
  comite_id: string
  trabajador_id: string
  representa: Representa
  calidad: Calidad
  cargo: CargoComite | null
  desde: string
  hasta: string | null
  curso_orientacion: string | null
  observaciones: string | null
}

export interface MiembroV extends Miembro {
  nombre: string
  rut: string
  cargo_laboral: string | null
  user_id: string | null
  trabajador_activo: boolean
  vigente: boolean
}

export type TipoReunion = 'ordinaria' | 'extraordinaria'
export type EstadoReunion = 'programada' | 'realizada'

export interface Reunion {
  id: string
  comite_id: string
  numero: number
  tipo: TipoReunion
  estado: EstadoReunion
  fecha: string
  hora: string | null
  lugar: string | null
  temas: string | null
  desarrollo: string | null
  acta_path: string | null
  acta_nombre: string | null
  creado_por: string | null
}

export interface ReunionV extends Reunion {
  presentes: number
  presentes_empresa: number
  presentes_trabajadores: number
  quorum: boolean
  acuerdos: number
  acuerdos_pendientes: number
}

export type EstadoAcuerdo = 'pendiente' | 'en_proceso' | 'cumplido' | 'anulado'
export const ESTADO_ACUERDO: Record<EstadoAcuerdo, { label: string; clase: string }> = {
  pendiente: { label: 'Pendiente', clase: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  en_proceso: { label: 'En proceso', clase: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200' },
  cumplido: { label: 'Cumplido', clase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  anulado: { label: 'Anulado', clase: 'bg-muted text-muted-foreground' },
}

export interface Acuerdo {
  id: string
  comite_id: string
  reunion_id: string | null
  descripcion: string
  responsable_user_id: string | null
  responsable_nombre: string | null
  fecha_compromiso: string | null
  estado: EstadoAcuerdo
  fecha_cumplimiento: string | null
  avance: string | null
  creado_por: string | null
  created_at: string
}

export interface AcuerdoV extends Acuerdo {
  reunion_numero: number | null
  reunion_fecha: string | null
  vencido: boolean
  dias_atraso: number
}

export const abierto = (a: Pick<Acuerdo, 'estado'>) => a.estado === 'pendiente' || a.estado === 'en_proceso'

// ---------------------------------------------------------------- comités y miembros

export async function listarComites(): Promise<ComiteV[]> {
  return (await unwrap(supabase.from('sso_comites_v').select('*').order('activo', { ascending: false }).order('nombre'))) as ComiteV[]
}

export type FichaComite = Pick<Comite, 'nombre' | 'faena' | 'periodo_desde' | 'periodo_hasta' | 'activo' | 'observaciones'>

export async function guardarComite(id: string | null, f: FichaComite): Promise<string> {
  if (id) {
    await unwrap(supabase.from('sso_comites').update(f).eq('id', id))
    return id
  }
  return ((await unwrap(supabase.from('sso_comites').insert(f).select('id').single())) as { id: string }).id
}

export async function listarMiembros(comiteId: string): Promise<MiembroV[]> {
  return (await unwrap(
    supabase.from('sso_comite_miembros_v').select('*').eq('comite_id', comiteId).order('representa').order('calidad').order('nombre'),
  )) as MiembroV[]
}

export type FichaMiembro = Pick<Miembro, 'trabajador_id' | 'representa' | 'calidad' | 'cargo' | 'desde' | 'hasta' | 'curso_orientacion' | 'observaciones'>

export async function guardarMiembro(comiteId: string, id: string | null, f: FichaMiembro): Promise<void> {
  if (id) await unwrap(supabase.from('sso_comite_miembros').update(f).eq('id', id))
  else await unwrap(supabase.from('sso_comite_miembros').insert({ ...f, comite_id: comiteId }))
}

export async function eliminarMiembro(id: string): Promise<void> {
  await unwrap(supabase.from('sso_comite_miembros').delete().eq('id', id))
}

/** Mensaje claro para los índices únicos de integrantes. */
export function errorMiembro(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err)
  if (m.includes('sso_comite_cargo_uq')) return 'Ya hay un integrante vigente con ese cargo (presidente o secretario)'
  if (m.includes('sso_comite_miembro_vigente_uq')) return 'Esa persona ya integra el comité'
  return m
}

// ---------------------------------------------------------------- reuniones

export async function listarReuniones(comiteId: string): Promise<ReunionV[]> {
  return (await unwrap(
    supabase.from('sso_comite_reuniones_v').select('*').eq('comite_id', comiteId).order('fecha', { ascending: false }).order('numero', { ascending: false }),
  )) as ReunionV[]
}

export async function obtenerReunion(id: string): Promise<ReunionV | null> {
  return (await unwrap(supabase.from('sso_comite_reuniones_v').select('*').eq('id', id).maybeSingle())) as ReunionV | null
}

export type FichaReunion = Pick<Reunion, 'comite_id' | 'tipo' | 'estado' | 'fecha' | 'hora' | 'lugar' | 'temas' | 'desarrollo'>

export async function guardarReunion(id: string | null, f: FichaReunion): Promise<string> {
  if (id) {
    await unwrap(supabase.from('sso_comite_reuniones').update(f).eq('id', id))
    return id
  }
  return ((await unwrap(supabase.from('sso_comite_reuniones').insert(f).select('id').single())) as { id: string }).id
}

export async function eliminarReunion(r: Reunion): Promise<void> {
  if (r.acta_path) await supabase.storage.from('sso').remove([r.acta_path])
  await unwrap(supabase.from('sso_comite_reuniones').delete().eq('id', r.id))
}

export async function listarAsistencia(reunionId: string): Promise<{ miembro_id: string; asistio: boolean }[]> {
  return (await unwrap(supabase.from('sso_comite_asistencia').select('miembro_id, asistio').eq('reunion_id', reunionId))) as {
    miembro_id: string
    asistio: boolean
  }[]
}

/** Reemplaza la asistencia: presentes con asistio = true, el resto de los convocados con false. */
export async function guardarAsistencia(reunionId: string, convocados: string[], presentes: Set<string>): Promise<void> {
  await unwrap(supabase.from('sso_comite_asistencia').delete().eq('reunion_id', reunionId))
  if (convocados.length) {
    await unwrap(supabase.from('sso_comite_asistencia').insert(convocados.map((m) => ({ reunion_id: reunionId, miembro_id: m, asistio: presentes.has(m) }))))
  }
}

export function errorActa(f: File): string | null {
  if (!ARCHIVOS_ACTA.includes(f.type)) return `"${f.name}": solo PDF o imagen`
  if (f.size > TAMANO_ACTA_MB * 1024 * 1024) return `"${f.name}" pesa más de ${TAMANO_ACTA_MB} MB`
  return null
}

/** Sube el acta firmada (reemplaza la anterior). */
export async function subirActa(r: Pick<Reunion, 'id' | 'acta_path'>, archivo: File): Promise<void> {
  const path = `comite/${r.id}/${Date.now()}-${nombreParaStorage(archivo.name)}`
  const { error } = await supabase.storage.from('sso').upload(path, archivo, { contentType: archivo.type })
  if (error) throw new Error(error.message)
  const { error: e2 } = await supabase.from('sso_comite_reuniones').update({ acta_path: path, acta_nombre: archivo.name }).eq('id', r.id)
  if (e2) {
    await supabase.storage.from('sso').remove([path])
    throw new Error(e2.message)
  }
  if (r.acta_path) await supabase.storage.from('sso').remove([r.acta_path])
}

export async function quitarActa(r: Pick<Reunion, 'id' | 'acta_path'>): Promise<void> {
  await unwrap(supabase.from('sso_comite_reuniones').update({ acta_path: null, acta_nombre: null }).eq('id', r.id))
  if (r.acta_path) await supabase.storage.from('sso').remove([r.acta_path])
}

export async function urlActa(path: string, nombre: string): Promise<string> {
  const { data, error } = await supabase.storage.from('sso').createSignedUrl(path, 600, { download: nombre })
  if (error) throw new Error(error.message)
  return data.signedUrl
}

// ---------------------------------------------------------------- acuerdos

export async function listarAcuerdos(filtro: { comiteId?: string; reunionId?: string }): Promise<AcuerdoV[]> {
  let q = supabase.from('sso_comite_acuerdos_v').select('*')
  if (filtro.comiteId) q = q.eq('comite_id', filtro.comiteId)
  if (filtro.reunionId) q = q.eq('reunion_id', filtro.reunionId)
  return (await unwrap(q.order('created_at'))) as AcuerdoV[]
}

export type FichaAcuerdo = Pick<Acuerdo, 'comite_id' | 'reunion_id' | 'descripcion' | 'responsable_user_id' | 'responsable_nombre' | 'fecha_compromiso' | 'estado' | 'avance' | 'fecha_cumplimiento'>

export async function guardarAcuerdo(id: string | null, f: FichaAcuerdo): Promise<void> {
  if (id) await unwrap(supabase.from('sso_comite_acuerdos').update(f).eq('id', id))
  else await unwrap(supabase.from('sso_comite_acuerdos').insert(f))
}

/** Lo que puede informar el responsable (la base no le deja cambiar nada más). */
export async function informarAvance(id: string, estado: EstadoAcuerdo, avance: string | null, fechaCumplimiento: string | null): Promise<void> {
  await unwrap(supabase.from('sso_comite_acuerdos').update({ estado, avance, fecha_cumplimiento: fechaCumplimiento }).eq('id', id))
}

export async function eliminarAcuerdo(id: string): Promise<void> {
  await unwrap(supabase.from('sso_comite_acuerdos').delete().eq('id', id))
}

/** Personas que pueden ser responsables de un acuerdo: las que ven el módulo. */
export async function listarResponsablesComite(): Promise<UsuarioSso[]> {
  return (await unwrap(supabase.rpc('sso_usuarios_modulo', { p_modulo: 'comite' }))) as UsuarioSso[]
}

export async function exportarAcuerdos(comite: Comite, acuerdos: AcuerdoV[], nombreUsuario: (id: string | null) => string) {
  const XLSX = await cargarXLSX()
  const serial = (f: string | null) => (f ? (Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86_400_000 : null)
  const filas = acuerdos.map((a) => ({
    Reunión: a.reunion_numero ? `N° ${a.reunion_numero}` : '',
    'Fecha reunión': serial(a.reunion_fecha),
    Acuerdo: a.descripcion,
    Responsable: a.responsable_user_id ? nombreUsuario(a.responsable_user_id) : a.responsable_nombre ?? '',
    Plazo: serial(a.fecha_compromiso),
    Estado: ESTADO_ACUERDO[a.estado].label + (a.vencido ? ' (vencido)' : ''),
    Cumplido: serial(a.fecha_cumplimiento),
    Avance: a.avance ?? '',
  }))
  const hoja = XLSX.utils.json_to_sheet(filas)
  for (let r = 1; r <= filas.length; r++) {
    for (const c of [1, 4, 6]) {
      const celda = hoja[XLSX.utils.encode_cell({ r, c })]
      if (celda && typeof celda.v === 'number') celda.z = 'dd-mm-yyyy'
    }
  }
  hoja['!cols'] = [9, 12, 60, 28, 12, 18, 12, 50].map((wch) => ({ wch }))
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Acuerdos')
  const sello = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
  XLSX.writeFile(libro, `comite-acuerdos-${comite.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${sello}.xlsx`)
}
