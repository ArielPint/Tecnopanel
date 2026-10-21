import { supabase } from '@/lib/supabaseClient'
import { errorTamanoArchivo, nombreParaStorage } from '@/lib/storageKey'
import type { EstadoPago as EstadoPagoBase } from '@/modules/estados_pago/types'
import type { TipoDocEmpresa } from './catalogos'

// Acceso a datos de Control de Contratistas y del portal de cada empresa. Quién ve y hace qué lo
// decide la base (RLS y funciones ing_* / ctr_*): aquí no se filtra nada por rol. Los archivos van
// al bucket de Ingreso de Personal, en la carpeta empresas/.

const BUCKET = 'ingreso-personal'

function error(e: { message: string; code?: string } | null, contexto?: string): never {
  throw new Error(contexto ? `${contexto}: ${e?.message}` : (e?.message ?? 'Error desconocido'))
}

/** Empresa contratista: las de Estados de Pago (subcontratistas), por la vista ing_empresas_v. */
export interface Empresa {
  id: string
  nombre: string
  rut: string | null
  email: string | null
  telefono: string | null
  activa: boolean
}

/** Listado de trabajadores que la empresa confirmó para un mes: la foto de sus trabajadores activos. */
export interface Listado {
  empresa_id: string
  periodo: string
  total: number
  trabajadores: { rut: string; nombre: string; cargo: string | null; sucursal: string }[]
  confirmado_por: string | null
  confirmado_at: string
  estado: EstadoRevision
  motivo_rechazo: string | null
  revisado_at: string | null
}

/** Estado de pago visto desde Contratistas (ing_estados_pago_v): con proyecto, subcontrato y empresa. */
export interface EstadoPagoEmpresa extends EstadoPagoBase {
  especialidad: string
  empresa_id: string
  proyecto_nombre: string
}

/** Documento mensual de una empresa contratista. periodo: primer día del mes. */
export type EstadoRevision = 'por_revisar' | 'aprobado' | 'rechazado'

export interface DocEmpresa {
  id: string
  empresa_id: string
  periodo: string
  tipo: TipoDocEmpresa
  path: string
  nombre: string
  subido_por: string | null
  created_at: string
  estado: EstadoRevision
  motivo_rechazo: string | null
  revisado_at: string | null
}

export async function listarEmpresas(): Promise<Empresa[]> {
  const { data, error: e } = await supabase.from('ing_empresas_v').select('*').order('nombre')
  if (e) error(e)
  return (data ?? []) as Empresa[]
}

/** Crea o corrige una empresa de la lista de Estados de Pago (administrador de Control de Contratistas). */
export async function guardarEmpresa(d: Omit<Empresa, 'id'> & { id?: string }): Promise<void> {
  const { error: e } = await supabase.rpc('ing_guardar_empresa', {
    p_id: d.id ?? null,
    p_nombre: d.nombre,
    p_rut: d.rut,
    p_email: d.email,
    p_telefono: d.telefono,
    p_activa: d.activa,
  })
  if (e) error(e)
}

/** Listados confirmados de un mes ('YYYY-MM-01'): de todas las empresas que se pueden ver. */
export async function listarListados(periodo: string): Promise<Listado[]> {
  const { data, error: e } = await supabase.from('ing_listados').select('*').eq('periodo', periodo)
  if (e) error(e)
  return (data ?? []) as Listado[]
}

/** Confirma el listado del mes. Sin empresa, el de la empresa de quien está conectado. Devuelve el total. */
export async function confirmarListado(periodo: string, empresaId?: string): Promise<number> {
  const { data, error: e } = await supabase.rpc('ing_confirmar_listado', { p_periodo: periodo, p_empresa_id: empresaId ?? null })
  if (e) error(e)
  return data as number
}

/** Documentos de todas las empresas en un mes ('YYYY-MM-01'). */
export async function listarDocsEmpresas(periodo: string): Promise<DocEmpresa[]> {
  const { data, error: e } = await supabase.from('ing_empresa_docs').select('*').eq('periodo', periodo).order('created_at')
  if (e) error(e)
  return (data ?? []) as DocEmpresa[]
}

export async function subirDocEmpresa(empresaId: string, periodo: string, tipo: TipoDocEmpresa, file: File): Promise<void> {
  const tamano = errorTamanoArchivo(file)
  if (tamano) throw new Error(tamano)
  if (file.size > 25 * 1024 * 1024) throw new Error(`"${file.name}" pesa más de 25 MB, el máximo de este portal.`)
  const path = `empresas/${empresaId}/${periodo.slice(0, 7)}/${Date.now()}-${nombreParaStorage(file.name)}`
  const { error: eSubir } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
  if (eSubir) error(eSubir, `No se pudo subir "${file.name}"`)
  const { error: eFila } = await supabase
    .from('ing_empresa_docs')
    .insert({ empresa_id: empresaId, periodo, tipo, path, nombre: file.name })
  if (eFila) {
    await supabase.storage.from(BUCKET).remove([path])
    error(eFila)
  }
}

export async function eliminarDocEmpresa(d: DocEmpresa): Promise<void> {
  const { data, error: e } = await supabase.from('ing_empresa_docs').delete().eq('id', d.id).select('id')
  if (e) error(e)
  if (!data?.length) throw new Error('No puedes eliminar este documento')
  await supabase.storage.from(BUCKET).remove([d.path])
}

export async function revisarDocEmpresa(id: string, aprobar: boolean, motivo?: string): Promise<void> {
  const { error: e } = await supabase.rpc('ing_revisar_doc_empresa', { p_id: id, p_aprobar: aprobar, p_motivo: motivo ?? null })
  if (e) error(e)
}

export async function revisarListado(empresaId: string, periodo: string, aprobar: boolean, motivo?: string): Promise<void> {
  const { error: e } = await supabase.rpc('ing_revisar_listado', { p_empresa_id: empresaId, p_periodo: periodo, p_aprobar: aprobar, p_motivo: motivo ?? null })
  if (e) error(e)
}

/** Estados de pago de todas las empresas (o de una), para quien valida (revisor o aprobador). */
export async function listarEstadosPagoEmpresas(empresaId?: string): Promise<EstadoPagoEmpresa[]> {
  let q = supabase.from('ing_estados_pago_v').select('*').order('created_at', { ascending: false })
  if (empresaId) q = q.eq('empresa_id', empresaId)
  const { data, error: e } = await q
  if (e) error(e)
  return (data ?? []) as EstadoPagoEmpresa[]
}

/** en_revision y rechazado: revisor; aprobado y pagado: aprobador. Rechazar exige comentario. */
export async function cambiarEstadoEp(id: string, estado: 'en_revision' | 'rechazado' | 'aprobado' | 'pagado', comentario?: string, montoPagado?: number): Promise<void> {
  const { error: e } = await supabase.rpc('ing_cambiar_estado_ep', {
    p_id: id,
    p_estado: estado,
    p_comentario: comentario ?? null,
    p_monto_pagado: montoPagado ?? null,
  })
  if (e) error(e)
}

