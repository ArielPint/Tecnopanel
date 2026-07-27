import { supabase } from '@/lib/supabaseClient'

const BUCKET = 'financiero-docs'

// path convention: {tipo}/{codigo_articulo}/{id}.pdf — se usa el id (uuid) del
// registro, no numero_oc/numero_factura, porque ninguno de los dos es único
// por sí solo en los datos reales (ver migraciones 008/009).
export function pdfPath(tipo: 'oc' | 'factura', codigoArticulo: string, id: string) {
  return `${tipo}/${codigoArticulo}/${id}.pdf`
}

export async function subirPdf(file: File, path: string): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: 'application/pdf',
  })
  if (error) throw new Error(error.message)
  return path
}

export async function getSignedUrl(path: string, expiresInSeconds = 300): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
