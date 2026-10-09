import { supabase } from '@/lib/supabaseClient'
import { nombreParaStorage } from '@/lib/storageKey'
import type { TipoEvidencia } from '../lib/tipos'

// Mismo patrón que estados_pago/services/storage.ts, con bucket propio y privado.
// La ruta la exige la política de storage.objects: <hallazgo_id>/<deteccion|cierre>/<archivo>.
const BUCKET = 'sso'

export function evidenciaPath(hallazgoId: string, tipo: TipoEvidencia, nombreArchivo: string) {
  return `${hallazgoId}/${tipo}/${Date.now()}-${nombreParaStorage(nombreArchivo)}`
}

export async function subirEvidencia(file: File, path: string): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
  if (error) throw new Error(error.message)
  return path
}

export async function getSignedUrls(paths: string[], expiresInSeconds = 3600): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, expiresInSeconds)
  if (error) throw new Error(error.message)
  const urls: Record<string, string> = {}
  for (const d of data ?? []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl
  return urls
}

export async function eliminarEvidenciaStorage(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw new Error(error.message)
}
