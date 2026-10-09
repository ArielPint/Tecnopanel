import { Navigate, useParams } from 'react-router-dom'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'
import { MODULOS_ATERRIZAJE } from '@/lib/aterrizaje'

// /proyectos/<slug>: entra al proyecto por el primer módulo con acceso, para los enlaces que apuntan
// al proyecto sin saber qué módulos tiene el usuario (selector de portales, "Otros portales").
export default function AterrizajeProyecto() {
  const { proyectoSlug = '' } = useParams<{ proyectoSlug: string }>()
  const permisos = usePermisosProyecto(proyectoSlug)

  if (permisos.loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">Cargando…</div>
  }
  const destino = MODULOS_ATERRIZAJE.find((m) => permisos.tieneAccion(m.modulo))
  return <Navigate to={destino ? `/proyectos/${proyectoSlug}/${destino.ruta}` : '/'} replace />
}
