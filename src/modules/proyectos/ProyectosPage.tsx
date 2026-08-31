import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import type { Proyecto } from '../dashboard/types'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { useAccesoUsuario } from '@/hooks/useAccesoUsuario'
import { getLineasNegocio, SUCURSALES, type LineaNegocio } from '@/lib/lineasNegocio'
import CrearProyectoDialog from './CrearProyectoDialog'
import EliminarProyectoDialog from './EliminarProyectoDialog'

const estadoTone: Record<string, 'success' | 'warning' | 'secondary'> = {
  activa: 'success',
  activo: 'success',
  pausada: 'warning',
  pausado: 'warning',
}

/** Proyecto + los códigos de sus líneas de negocio (F1, plan §8.3). */
type ProyectoConLineas = Proyecto & { lineas: string[] }

const SIN_LINEA = 'sin-linea'

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
  const [proyectos, setProyectos] = useState<ProyectoConLineas[]>([])
  const [catalogo, setCatalogo] = useState<LineaNegocio[]>([])
  const [sucursal, setSucursal] = useState<string>('todas')
  const [loading, setLoading] = useState(true)
  const { isAdmin, isSuperAdmin } = useAccesoUsuario()

  const cargarProyectos = useCallback(() => {
    return supabase
      .from('proyectos')
      .select('*, proyecto_lineas(lineas_negocio(codigo))')
      .order('nombre')
      .then(({ data }) => {
        // El CRM es un sistema de gestión interna, no una obra de Tecnopanel — se administra
        // en su propia sección (ver /crm). 'sistema' es el pseudo-proyecto ancla del módulo
        // Gestión (§3.6, ver Reportes) — tampoco es una obra real, se administra en /gestion.
        const filas = (data ?? []).filter((p) => !['crm', 'sistema'].includes(p.tipo?.toLowerCase() ?? ''))
        setProyectos(
          filas.map((p) => ({
            ...(p as Proyecto),
            lineas: ((p.proyecto_lineas ?? []) as { lineas_negocio: { codigo: string } | null }[])
              .map((pl) => pl.lineas_negocio?.codigo)
              .filter((c): c is string => Boolean(c)),
          })),
        )
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    cargarProyectos()
    getLineasNegocio().then(setCatalogo).catch(() => setCatalogo([]))
  }, [cargarProyectos])

  const filtrados = useMemo(
    () => (sucursal === 'todas' ? proyectos : proyectos.filter((p) => p.sucursal === sucursal)),
    [proyectos, sucursal],
  )

  // Un proyecto con dos líneas aparece en los dos grupos — es la decisión tomada
  // en el plan §8.0 ("cuenta completo en cada línea"), por eso cada tarjeta
  // muestra sus líneas como badge y no se lee como duplicado.
  const grupos = useMemo(() => {
    const porLinea = catalogo.map((l) => ({
      key: l.codigo,
      titulo: l.nombre,
      color: l.color,
      items: filtrados.filter((p) => p.lineas.includes(l.codigo)),
    }))
    const huerfanos = filtrados.filter((p) => p.lineas.length === 0)
    if (huerfanos.length > 0) {
      porLinea.push({ key: SIN_LINEA, titulo: 'Sin línea asignada', color: null, items: huerfanos })
    }
    return porLinea.filter((g) => g.items.length > 0)
  }, [catalogo, filtrados])

  function renderTarjeta(p: ProyectoConLineas) {
    const internalRoute = rutaInterna(p)
    const cardClass =
      'group flex items-start gap-4 rounded-lg border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md'
    const content = (
      <>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-info/10 text-info">
          <Building2 className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold">{p.nombre}</h2>
            <Badge variant={estadoTone[p.estado?.toLowerCase()] ?? 'secondary'}>{p.estado}</Badge>
            {p.sucursal && <Badge variant="secondary">{p.sucursal}</Badge>}
            {p.lineas.map((c) => (
              <Badge key={c} variant="secondary">
                {c}
              </Badge>
            ))}
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
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold">Proyectos</h1>
          <p className="text-sm text-muted-foreground">Acceso rápido a los proyectos existentes.</p>
        </div>
        {isAdmin && <CrearProyectoDialog onCreado={cargarProyectos} />}
      </div>

      <div className="flex flex-wrap gap-1">
        {['todas', ...SUCURSALES].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={sucursal === s ? 'default' : 'outline'}
            onClick={() => setSucursal(s)}
          >
            {s === 'todas' ? 'Todas las sucursales' : s}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {proyectos.length === 0
            ? 'Aún no hay proyectos cargados en el portal.'
            : 'No hay proyectos en esta sucursal.'}
        </p>
      ) : (
        grupos.map((g) => (
          <section key={g.key} className="space-y-2">
            <div className="flex items-center gap-2">
              {g.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color }} />}
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{g.titulo}</h2>
              <span className="text-xs text-muted-foreground">({g.items.length})</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{g.items.map(renderTarjeta)}</div>
          </section>
        ))
      )}
    </div>
  )
}
