import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getProyectoId } from '@/lib/proyectoIds'
import { loadPlantaModulos } from '@/modules/planta/lib/supaData'
import { isModuloTerminado } from '@/modules/planta/lib/partidas'

// Módulos con checklist de producción 100% aprobado (misma fuente/lógica que
// el módulo Producción), para acotar el selector de Despacho GD a lo que
// realmente puede despacharse.
export function useModulosTerminados() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const [terminados, setTerminados] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelado = false
    getProyectoId(proyectoSlug!).then((proyectoId) =>
      loadPlantaModulos(proyectoId).then((rows) => {
        if (cancelado) return
        const set = new Set<string>()
        for (const r of rows) {
          const nombre = String(r.nombre ?? '').trim()
          if (nombre && isModuloTerminado(r)) set.add(nombre)
        }
        setTerminados(set)
      }),
    )
    return () => {
      cancelado = true
    }
  }, [proyectoSlug])

  return terminados
}
