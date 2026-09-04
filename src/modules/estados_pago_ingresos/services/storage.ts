import { supabase } from '@/lib/supabaseClient'
import { nombreParaStorage } from '@/lib/storageKey'

// Mismo patrón que estados_pago/services/storage.ts — bucket propio, path por
// id de registro (no por número, que puede repetirse o no ser único).
const BUCKET = 'estados-pago-ingresos-docs'

// El nombre va saneado: Storage rechaza con HTTP 400 las claves con caracteres fuera
// de su charset, asi que un archivo con tilde o ñ no subia nunca. El nombre original
// se guarda aparte, en estados_pago*_documentos.nombre, que es lo que se muestra.
export function documentoPath(estadoPagoIngresoId: string, documentoId: string, nombreArchivo: string) {
  return `${estadoPagoIngresoId}/${documentoId}-${nombreParaStorage(nombreArchivo)}`
}

export async function subirDocumento(file: File, path: string): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
  if (error) throw new Error(error.message)
  return path
}

export async function getSignedUrl(path: string, expiresInSeconds = 300): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

export async function eliminarDocumento(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw new Error(error.message)
}
