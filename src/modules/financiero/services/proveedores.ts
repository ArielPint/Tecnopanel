import { supabase } from '@/lib/supabaseClient'

// OC/Facturas tienen proveedor_rut como FK a financiero_proveedores(rut).
// Si el RUT no está registrado todavía, esto lo crea (solo el RUT, sin
// nombre) para que el insert de OC/Factura no falle por la FK — el nombre
// se completa después desde una UI de proveedores. No pisa el nombre de un
// proveedor que ya existía (ignoreDuplicates).
export async function asegurarProveedor(rut: string | null | undefined) {
  if (!rut) return
  const { error } = await supabase
    .from('financiero_proveedores')
    .upsert({ rut }, { onConflict: 'rut', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}
