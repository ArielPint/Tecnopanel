import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import type { Proyecto } from '../dashboard/types'
import { Badge } from '@/components/ui/badge'
import { useAccesoUsuario } from '@/hooks/useAccesoUsuario'
import CrearProyectoDialog from './CrearProyectoDialog'
import EliminarProyectoDialog from './EliminarProyectoDialog'

const estadoTone: Record<string, 'success' | 'warning' | 'secondary'> = {
  activa: 'success',
  activo: 'success',
  pausada: 'warning',
  pausado: 'warning',
}

// Proyectos ya migrados adentro del hub — link interno en vez del url_app
// externo (que apunta al sitio standalone viejo, pre-fusión). Fase F: derivado
// de `tipo`, ya no hardcodeado a un slug fijo — cualquier proyecto tipo obra
// entra por su propio /proyectos/:slug/dashboard.
function rutaInterna(p: Proyecto): string | undefined {
  if (p.tipo?.toLowerCase() === 'crm') return '/crm'
  if (p.tipo?.toLowerCase() === 'construccion' || p.tipo?.toLowerCase() === 'custom') {
    return `/proyectos/${p.slug}/dashboard`
  }
  return undefined
}

export default function ProyectosPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [loading, setLoading] = useState(true)
  const { isAdmin, isSuperAdmin } = useAccesoUsuario()

  const cargarProyectos = useCallback(() => {
    return supabase
      .from('proyectos')
      .select('*')
      .order('nombre')
      .then(({ data }) => {
        // El CRM es un sistema de gestión interna, no una obra de Tecnopanel —
        // se administra en su propia sección (ver /crm), no acá.
        setProyectos((data ?? []).filter((p) => p.tipo?.toLowerCase() !== 'crm'))
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    cargarProyectos()
  }, [cargarProyectos])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold">Proyectos</h1>
          <p className="text-sm text-muted-foreground">Acceso rápido a los proyectos existentes.</p>
        </div>
        {isAdmin && <CrearProyectoDialog onCreado={cargarProyectos} />}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : proyectos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay proyectos cargados en el portal.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {proyectos.map((p) => {
            const internalRoute = rutaInterna(p)
            const cardClass =
              'group flex items-start gap-4 rounded-lg border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md'
            const content = (
              <>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-info/10 text-info">
                  <Building2 className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold">{p.nombre}</h2>
                    <Badge variant={estadoTone[p.estado?.toLowerCase()] ?? 'secondary'}>{p.estado}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{p.descripcion}</p>
                </div>
                {!internalRoute && p.url_app && (
                  <ExternalLink className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
                )}
              </>
            )
            return (
              <div key={p.id} className="relative">
                {internalRoute ? (
                  <Link to={internalRoute} className={cardClass}>
                    {content}
                  </Link>
                ) : (
                  <a
                    href={p.url_app ?? undefined}
                    target={p.url_app ? '_blank' : undefined}
                    rel={p.url_app ? 'noreferrer' : undefined}
                    className={cardClass}
                  >
                    {content}
                  </a>
                )}
                {isSuperAdmin && (
                  <div className="absolute right-2 top-2">
                    <EliminarProyectoDialog proyecto={{ id: p.id, nombre: p.nombre }} onEliminado={cargarProyectos} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
