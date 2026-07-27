import { useEffect, useState } from 'react'
import { Building2, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import type { Proyecto } from '../dashboard/types'
import { Badge } from '@/components/ui/badge'

const estadoTone: Record<string, 'success' | 'warning' | 'secondary'> = {
  activa: 'success',
  activo: 'success',
  pausada: 'warning',
  pausado: 'warning',
}

export default function ProyectosPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Proyectos</h1>
        <p className="text-sm text-muted-foreground">
          Gestión y creación de proyectos adicionales llega en la Fase 4 (Admin Panel). Por ahora,
          acceso rápido a los proyectos existentes.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : proyectos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay proyectos cargados en el hub.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {proyectos.map((p) => (
            <a
              key={p.id}
              href={p.url_app ?? undefined}
              target={p.url_app ? '_blank' : undefined}
              rel={p.url_app ? 'noreferrer' : undefined}
              className="group flex items-start gap-4 rounded-lg border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md"
            >
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
              {p.url_app && <ExternalLink className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
