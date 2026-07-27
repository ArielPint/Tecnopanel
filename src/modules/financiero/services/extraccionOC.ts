import { supabase } from '@/lib/supabaseClient'
import type { ExtraccionOC } from '@/modules/financiero/types/financiero'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const resultado = reader.result as string
      // reader.result viene como data URL ("data:application/pdf;base64,XXXX") — solo interesa la parte base64
      resolve(resultado.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export async function extraerDatosOC(file: File): Promise<ExtraccionOC> {
  const pdfBase64 = await fileToBase64(file)
  const { data, error } = await supabase.functions.invoke<ExtraccionOC>('extraer-oc-pdf', {
    body: { pdfBase64 },
  })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('La extracción no devolvió datos')
  return data
}
