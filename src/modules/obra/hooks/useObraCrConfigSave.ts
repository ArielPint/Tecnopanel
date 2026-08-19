import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { getProyectoId } from '@/lib/proyectoIds'
import { guardarObraCrConfigBatch, type ObraCrConfigCambio } from '../lib/supaData'
import { invalidateObraCr } from './useObraCrData'

export function useObraCrConfigBatchSave() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [guardando, setGuardando] = useState(false)

  async function guardarTodo(cambios: ObraCrConfigCambio[]) {
    setGuardando(true)
    try {
      const proyectoId = await getProyectoId(proyectoSlug!)
      await guardarObraCrConfigBatch(proyectoId, cambios)
      invalidateObraCr(proyectoSlug!)
      toast.success(`${cambios.length} asignación(es) guardada(s)`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
      throw e
    } finally {
      setGuardando(false)
    }
  }

  return { guardarTodo, guardando }
}
