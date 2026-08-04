import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getProyectoId } from '@/lib/proyectoIds'
import { loadPlantaModulos } from '@/modules/planta/lib/supaData'

// Módulos marcados "MODULO TERMINADO" en planta_modulos.estado_modulo (calculado
// al subir el Excel de avance), para acotar el selector de Despacho GD a lo que
// realmente puede despacharse. No usa isModuloTerminado(estados) del checklist
// partida-por-partida: ese checklist tiene ~9 partidas sin columna equivalente
// en el Excel (ver avanceProduccionParser.ts) y por eso nunca marca un módulo
// como terminado en la práctica, aunque estado_modulo ya lo diga.
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
          if (nombre && r.estado_modulo === 'MODULO TERMINADO') set.add(nombre)
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
