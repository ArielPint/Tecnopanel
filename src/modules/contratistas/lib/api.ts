import { supabase } from '@/lib/supabaseClient'
import { listarEmpresas, type Empresa } from '@/modules/personal/lib/api'
import type { Empresa as EmpresaSso, FichaTrabajador, TrabajadorV } from '@/modules/sso/lib/tiposTrabajadores'
import { formatearRut } from '@/modules/sso/lib/rut'
import type { EstadoPago } from '@/modules/estados_pago/types'

// Portal de cada empresa contratista. La base ya deja ver solo lo de su empresa (RLS con
// subcontratista_actual()); igual se filtra por empresa por si la cuenta además tiene Prevención.
// Los trabajadores son los de Prevención (sso_trabajadores), con el mismo formulario y la misma
// plantilla Excel.

/** La empresa de la cuenta conectada (Estados de Pago), o null si la cuenta no es de un contratista. */
export async function miEmpresa(): Promise<Empresa | null> {
  const { data: id } = await supabase.rpc('subcontratista_actual')
  if (!id) return null
  return (await listarEmpresas()).find((e) => e.id === id) ?? null
}

/** Su fila en el catálogo de empresas de Prevención (enlazada sola desde Estados de Pago). */
export async function miEmpresaSso(empresaId: string): Promise<EmpresaSso | null> {
  const { data, error } = await supabase
    .from('sso_empresas')
    .select('id, nombre, rut, propia, activa')
    .eq('subcontratista_id', empresaId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as EmpresaSso | null
}

export async function misTrabajadores(empresaSsoId: string): Promise<TrabajadorV[]> {
  const { data, error } = await supabase
    .from('sso_trabajadores_v')
    .select('*')
    .eq('empresa_id', empresaSsoId)
    .order('apellidos')
    .order('nombres')
  if (error) throw new Error(error.message)
  return (data ?? []) as TrabajadorV[]
}

/** Guarda las fichas del Excel de a una, para que un RUT que ya tiene otra empresa no frene al resto. */
export async function guardarFichas(fichas: FichaTrabajador[]): Promise<void> {
  const fallidas: string[] = []
  for (const f of fichas) {
    const { error } = await supabase.from('sso_trabajadores').upsert(f, { onConflict: 'rut' })
    if (error) fallidas.push(formatearRut(f.rut))
  }
  if (fallidas.length) {
    throw new Error(
      `Se guardaron ${fichas.length - fallidas.length} de ${fichas.length}. No se pudieron guardar: ${fallidas.join(', ')}. ` +
        'Si ese RUT ya está registrado por otra empresa, avisa a Prevención de Riesgos de Tecnopanel.',
    )
  }
}

/** Subcontrato de la empresa, con el nombre del proyecto (ing_mis_subcontratos_v). */
export interface MiSubcontrato {
  id: string
  proyecto_id: string
  subcontratista_id: string
  especialidad: string
  monto_contractual: number
  estado: string
  created_at: string
  proyecto_nombre: string
}

export async function misSubcontratos(): Promise<MiSubcontrato[]> {
  const { data, error } = await supabase.from('ing_mis_subcontratos_v').select('*').order('proyecto_nombre').order('especialidad')
  if (error) throw new Error(error.message)
  return (data ?? []) as MiSubcontrato[]
}

/** Estados de pago de sus subcontratos (la RLS ya deja solo los suyos). */
export async function misEstadosPago(subcontratoIds: string[]): Promise<EstadoPago[]> {
  if (subcontratoIds.length === 0) return []
  const { data, error } = await supabase
    .from('estados_pago')
    .select('*')
    .in('subcontrato_id', subcontratoIds)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as EstadoPago[]
}

type DatosEP = Pick<
  EstadoPago,
  'subcontrato_id' | 'numero_ep' | 'periodo' | 'fecha_emision' | 'fecha_recepcion' | 'monto_bruto' | 'descuentos' | 'retenciones' | 'monto_neto' | 'observaciones' | 'documento_principal_path'
>

/** Lo emite la empresa: queda 'emitido' y en el proyecto de su subcontrato (lo fija la base). */
export async function crearEstadoPago(input: DatosEP, proyectoId: string): Promise<EstadoPago> {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('estados_pago')
    .insert({ ...input, proyecto_id: proyectoId, estado: 'emitido', creado_por: userData.user?.id ?? null })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as EstadoPago
}

/** Mientras está emitido (después lo revisa Tecnopanel y ya no se puede cambiar). */
export async function actualizarEstadoPago(id: string, patch: Partial<DatosEP>): Promise<void> {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('estados_pago')
    .update({ ...patch, actualizado_por: userData.user?.id ?? null })
    .eq('id', id)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Solo se puede modificar mientras está emitido (sin revisar).')
}
