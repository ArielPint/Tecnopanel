import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Proyecto } from '../dashboard/types'

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

  if (loading) return <p className="text-sm text-gray-500 dark:text-white/50">Cargando…</p>

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Proyectos</h1>
        <p className="text-sm text-gray-500 dark:text-white/50">
          Gestión y creación de proyectos adicionales llega en la Fase 4 (Admin Panel). Por ahora,
          acceso rápido a los proyectos existentes.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {proyectos.map((p) => (
          <div key={p.id} className="rounded-lg border bg-white p-4 shadow-sm dark:bg-neutral-800 dark:border-white/10">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-gray-900 dark:text-white">{p.nombre}</h2>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/10 dark:text-white/60">
                {p.estado}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-white/50">{p.descripcion}</p>
            {p.url_app && (
              <a
                href={p.url_app}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sm font-medium text-tecnopanel hover:text-tecnopanel-hover hover:underline"
              >
                Abrir app →
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
