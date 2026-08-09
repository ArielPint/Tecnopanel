import { toast } from 'sonner'
import type { PostgrestError } from '@supabase/supabase-js'

// Muestra toast + log si `error` no es null. Devuelve true si hubo error (para early-return).
export function handleSupabaseError(error: PostgrestError | Error | null, context: string): boolean {
  if (!error) return false
  console.error(context, error)
  toast.error(error.message || 'Error inesperado')
  return true
}
