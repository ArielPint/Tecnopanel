import { cargarXLSX } from '@/lib/cargarLibrerias'
import { supabase, unwrap } from '@/lib/supabaseClient'
import { nombreParaStorage } from '@/lib/storageKey'
import { comprimirImagen } from './imagen'
import type { TrabajadorV } from './tiposTrabajadores'

// Entrega de EPP (fase 4). El comprobante firmado va en el bucket 'sso', carpeta epp/<entrega_id>/.

export const CATEGORIAS_EPP = [
  { key: 'cabeza', label: 'Cabeza' },
  { key: 'ojos', label: 'Ojos y cara' },
  { key: 'oidos', label: 'Oídos' },
  { key: 'respiratoria', label: 'Respiratoria' },
  { key: 'manos', label: 'Manos' },
  { key: 'pies', label: 'Pies' },
  { key: 'cuerpo', label: 'Cuerpo' },
  { key: 'altura', label: 'Trabajo en altura' },
  { key: 'otro', label: 'Otro' },
] as const
export type CategoriaEpp = (typeof CATEGORIAS_EPP)[number]['key']

export const MOTIVOS_ENTREGA = [
  { key: 'primera', label: 'Primera entrega' },
  { key: 'reposicion', label: 'Reposición por vida útil' },
  { key: 'deterioro', label: 'Deterioro' },
  { key: 'perdida', label: 'Pérdida' },
] as const
export type MotivoEntrega = (typeof MOTIVOS_ENTREGA)[number]['key']
export const MOTIVO_LABEL = Object.fromEntries(MOTIVOS_ENTREGA.map((m) => [m.key, m.label])) as Record<MotivoEntrega, string>

export interface ElementoEpp {
  id: string
  nombre: string
  categoria: CategoriaEpp
  /** null: se repone solo por deterioro o pérdida */
  vida_util_meses: number | null
  requiere_talla: boolean
  activo: boolean
}

export interface Entrega {
  id: string
  trabajador_id: string
  fecha: string
  motivo: MotivoEntrega
  observaciones: string | null
  comprobante_path: string | null
  comprobante_nombre: string | null
  entregado_por: string | null
  created_at: string
  updated_at: string
}

export interface EntregaV extends Entrega {
  elementos: number
  unidades: number
}

export interface ItemEntrega {
  entrega_id: string
  epp_id: string
  cantidad: number
  talla: string | null
}

export type SituacionEpp = 'vigente' | 'por_vencer' | 'vencido'

/** Fila de sso_epp_vigentes: lo último entregado de cada elemento a cada trabajador. */
export interface EppVigente {
  trabajador_id: string
  epp_id: string
  entrega_id: string
  fecha: string
  cantidad: number
  talla: string | null
  reposicion: string | null
  situacion: SituacionEpp
}

// ---------------------------------------------------------------- catálogo

export async function listarCatalogoEpp(): Promise<ElementoEpp[]> {
  return (await unwrap(supabase.from('sso_epp_catalogo').select('id, nombre, categoria, vida_util_meses, requiere_talla, activo').order('categoria').order('nombre'))) as ElementoEpp[]
}

export async function guardarElementoEpp(e: Partial<ElementoEpp> & { nombre: string }): Promise<void> {
  const { id, ...campos } = e
  await unwrap(id ? supabase.from('sso_epp_catalogo').update(campos).eq('id', id) : supabase.from('sso_epp_catalogo').insert(campos))
}

// ---------------------------------------------------------------- entregas

export async function listarEntregas(trabajadorId?: string): Promise<EntregaV[]> {
  let q = supabase.from('sso_epp_entregas_v').select('*')
  if (trabajadorId) q = q.eq('trabajador_id', trabajadorId)
  return (await unwrap(q.order('fecha', { ascending: false }).order('created_at', { ascending: false }))) as EntregaV[]
}

export async function obtenerEntrega(id: string): Promise<EntregaV | null> {
  return (await unwrap(supabase.from('sso_epp_entregas_v').select('*').eq('id', id).maybeSingle())) as EntregaV | null
}

export async function listarItems(entregaIds?: string[]): Promise<ItemEntrega[]> {
  let q = supabase.from('sso_epp_entrega_items').select('entrega_id, epp_id, cantidad, talla')
  if (entregaIds) q = q.in('entrega_id', entregaIds.length ? entregaIds : ['00000000-0000-0000-0000-000000000000'])
  return (await unwrap(q)) as ItemEntrega[]
}

export async function listarEppVigentes(trabajadorId?: string): Promise<EppVigente[]> {
  let q = supabase.from('sso_epp_vigentes').select('*')
  if (trabajadorId) q = q.eq('trabajador_id', trabajadorId)
  return (await unwrap(q)) as EppVigente[]
}

export type FichaEntrega = Pick<Entrega, 'trabajador_id' | 'fecha' | 'motivo' | 'observaciones'>

/** Crea o actualiza la entrega y deja exactamente esos elementos. */
export async function guardarEntrega(
  id: string | null,
  ficha: FichaEntrega,
  items: { epp_id: string; cantidad: number; talla: string | null }[],
): Promise<string> {
  let entregaId = id
  if (entregaId) {
    await unwrap(supabase.from('sso_epp_entregas').update(ficha).eq('id', entregaId))
  } else {
    const fila = (await unwrap(supabase.from('sso_epp_entregas').insert(ficha).select('id').single())) as { id: string }
    entregaId = fila.id
  }
  const actuales = await listarItems([entregaId])
  const quedan = new Set(items.map((i) => i.epp_id))
  const quitar = actuales.filter((a) => !quedan.has(a.epp_id)).map((a) => a.epp_id)
  if (quitar.length) await unwrap(supabase.from('sso_epp_entrega_items').delete().eq('entrega_id', entregaId).in('epp_id', quitar))
  if (items.length) {
    await unwrap(supabase.from('sso_epp_entrega_items').upsert(items.map((i) => ({ entrega_id: entregaId, ...i })), { onConflict: 'entrega_id,epp_id' }))
  }
  return entregaId
}

export async function eliminarEntrega(e: Entrega): Promise<void> {
  if (e.comprobante_path) await supabase.storage.from('sso').remove([e.comprobante_path])
  await unwrap(supabase.from('sso_epp_entregas').delete().eq('id', e.id))
}

export async function subirComprobante(e: Pick<Entrega, 'id' | 'comprobante_path'>, archivo: File): Promise<void> {
  const final = archivo.type.startsWith('image/') ? await comprimirImagen(archivo) : archivo
  const path = `epp/${e.id}/${Date.now()}-${nombreParaStorage(final.name)}`
  const { error } = await supabase.storage.from('sso').upload(path, final, { contentType: final.type })
  if (error) throw new Error(error.message)
  try {
    await unwrap(supabase.from('sso_epp_entregas').update({ comprobante_path: path, comprobante_nombre: archivo.name }).eq('id', e.id))
  } catch (err) {
    await supabase.storage.from('sso').remove([path])
    throw err
  }
  if (e.comprobante_path) await supabase.storage.from('sso').remove([e.comprobante_path])
}

export async function urlComprobante(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('sso').createSignedUrl(path, 600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

// ---------------------------------------------------------------- Excel

/** Una fila por elemento entregado (lo que se pide en una fiscalización del registro de EPP). */
export async function exportarEntregasExcel(entregas: EntregaV[], items: ItemEntrega[], catalogo: ElementoEpp[], trabajadores: TrabajadorV[]) {
  const XLSX = await cargarXLSX()
  const ent = new Map(entregas.map((e) => [e.id, e]))
  const cat = new Map(catalogo.map((c) => [c.id, c]))
  const trab = new Map(trabajadores.map((t) => [t.id, t]))
  const serial = (f: string) => (Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86_400_000
  const filas = items
    .filter((i) => ent.has(i.entrega_id))
    .map((i) => {
      const e = ent.get(i.entrega_id)!
      const t = trab.get(e.trabajador_id)
      return {
        Fecha: serial(e.fecha),
        RUT: t?.rut ?? '',
        Trabajador: t ? `${t.apellidos}, ${t.nombres}` : '',
        Empresa: t?.empresa ?? '',
        Cargo: t?.cargo ?? '',
        Elemento: cat.get(i.epp_id)?.nombre ?? '',
        Cantidad: i.cantidad,
        Talla: i.talla ?? '',
        Motivo: MOTIVO_LABEL[e.motivo],
        'Comprobante firmado': e.comprobante_path ? 'Sí' : 'No',
      }
    })
    .sort((a, b) => b.Fecha - a.Fecha || a.Trabajador.localeCompare(b.Trabajador))
  const hoja = XLSX.utils.json_to_sheet(filas)
  for (let r = 1; r <= filas.length; r++) {
    const c = hoja[XLSX.utils.encode_cell({ r, c: 0 })]
    if (c && typeof c.v === 'number') c.z = 'dd-mm-yyyy'
  }
  hoja['!cols'] = [12, 12, 30, 24, 22, 34, 9, 8, 22, 12].map((wch) => ({ wch }))
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Entregas EPP')
  const sello = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
  XLSX.writeFile(libro, `prevencion-entregas-epp-${sello}.xlsx`)
}
