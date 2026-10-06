import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  listarMateriales,
  listarPaneles,
  listarProyectos,
  listarProyectosPropios,
  listarRecetas,
  type Material,
  type Panel,
  type Proyecto,
  type ProyectoPropio,
  type RecetaFila,
} from '../lib/api'
import { opcionesDestino } from '../lib/destinos'

/** Paneles, materiales, recetas y proyectos: lo usan casi todas las pantallas del portal. */
export function useCatalogo() {
  const [paneles, setPaneles] = useState<Panel[]>([])
  const [materiales, setMateriales] = useState<Material[]>([])
  const [recetas, setRecetas] = useState<RecetaFila[]>([])
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [proyectosPropios, setProyectosPropios] = useState<ProyectoPropio[]>([])
  const [loading, setLoading] = useState(true)

  const recargar = useCallback(async () => {
    try {
      const [p, m, r, pr, pp] = await Promise.all([listarPaneles(), listarMateriales(), listarRecetas(), listarProyectos(), listarProyectosPropios()])
      setPaneles(p)
      setMateriales(m)
      setRecetas(r)
      setProyectos(pr)
      setProyectosPropios(pp)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cargar el catálogo')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const derivados = useMemo(() => {
    const panelPorId = new Map(paneles.map((p) => [p.id, p]))
    const materialPorId = new Map(materiales.map((m) => [m.id, m]))
    const conReceta = new Set(recetas.map((r) => r.panel_id))
    return {
      panelPorId,
      materialPorId,
      /** Paneles que se pueden producir: activos y con receta */
      panelesProducibles: paneles.filter((p) => p.activo && conReceta.has(p.id)),
      tieneReceta: (panelId: string) => conReceta.has(panelId),
      /** Obras del hub + proyectos propios, para los <select> (valor 'h:<id>' / 'p:<id>') */
      destinos: opcionesDestino(proyectos, proyectosPropios),
    }
  }, [paneles, materiales, recetas, proyectos, proyectosPropios])

  return { paneles, materiales, recetas, proyectos, proyectosPropios, loading, recargar, ...derivados }
}
