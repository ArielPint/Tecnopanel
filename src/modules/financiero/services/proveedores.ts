import { supabase } from '@/lib/supabaseClient'

// OC/Facturas tienen proveedor_rut+proyecto_id como FK compuesta a
// financiero_proveedores(rut, proyecto_id) — el RUT ya no es único global
// (Proyecto B puede reusar un RUT sin pisar la fila de otro proyecto). Si el
// RUT no está registrado todavía para este proyecto, esto lo crea (solo el
// RUT, sin nombre) para que el insert de OC/Factura no falle por la FK — el
// nombre se completa después desde una UI de proveedores. No pisa el nombre
// de un proveedor que ya existía (ignoreDuplicates).
export async function asegurarProveedor(rut: string | null | undefined, proyectoId: string) {
  if (!rut) return
  const { error } = await supabase
    .from('financiero_proveedores')
    .upsert({ rut, proyecto_id: proyectoId }, { onConflict: 'rut,proyecto_id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}
