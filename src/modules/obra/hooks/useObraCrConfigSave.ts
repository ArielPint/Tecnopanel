import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { getProyectoId } from '@/lib/proyectoIds'
import { guardarObraCrConfig } from '../lib/supaData'
import { invalidateObraCr } from './useObraCrData'

export function useObraCrConfigSave() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [guardandoNum, setGuardandoNum] = useState<number | null>(null)

  async function guardar(moduloNum: number, cambios: { subcontrato: 'W' | 'C' | null; fechaEntregaFinal: string | null }) {
    setGuardandoNum(moduloNum)
    try {
      const proyectoId = await getProyectoId(proyectoSlug!)
      await guardarObraCrConfig(proyectoId, moduloNum, cambios)
      invalidateObraCr(proyectoSlug!)
      toast.success(`Módulo M-${String(moduloNum).padStart(5, '0')} actualizado`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardandoNum(null)
    }
  }

  return { guardar, guardandoNum }
}
