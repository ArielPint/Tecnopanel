import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'
import { useObraCrData } from '../hooks/useObraCrData'
import { buildEntregasFlat } from '../lib/matrix'
import { ASIGNACION_DEFS, ASIGNACION_ORDER, SUBCONTRATO_LABEL, type AsignacionCategoria, type ObraSubcontrato } from '../lib/categorias'
import CalendarioEntregas from '../components/CalendarioEntregas'

const SUBCONTRATO_PERMISO_A_OBRA: Record<'WEDO' | 'CONBES', ObraSubcontrato> = { WEDO: 'W', CONBES: 'C' }

function tituloCategoria(cat: AsignacionCategoria): string {
  const def = ASIGNACION_DEFS[cat]
  if (!def.subcontratoFijo) return `${def.label} (We Do / Conbes)`
  return `${def.label} (${SUBCONTRATO_LABEL[def.subcontratoFijo]})`
}

export default function EntregaCliente() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const { subcontrato } = usePermisosProyecto(proyectoSlug ?? '')
  const { modulos, loading, hayCR } = useObraCrData()
  const entregas = useMemo(() => buildEntregasFlat(modulos), [modulos])
  // Con subcontrato asociado: solo "terminaciones" aplica (las otras 3 categorías
  // son de otras empresas fijas), filtrado además al código propio (W/C).
  const categorias = subcontrato ? (['terminaciones'] as AsignacionCategoria[]) : ASIGNACION_ORDER

  const porCategoria = useMemo(
    () =>
      categorias.map((cat) => ({
        cat,
        entregas: entregas.filter((e) => e.categoria === cat && (!subcontrato || e.subcontrato === SUBCONTRATO_PERMISO_A_OBRA[subcontrato])),
      })),
    [entregas, categorias, subcontrato],
  )

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
  if (!hayCR) return <p className="py-10 text-center text-sm text-muted-foreground">Sin CR cargado todavía — subilo desde la pestaña Configuración.</p>

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">Calendario armado a partir de las fechas de entrega cargadas por módulo y categoría en la pestaña Configuración.</p>
      {porCategoria.map(({ cat, entregas: entregasCat }) => (
        <div key={cat} className="space-y-2">
          <h3 className="text-sm font-semibold">{tituloCategoria(cat)}</h3>
          <CalendarioEntregas
            entregas={entregasCat}
            emptyMessage="Ningún módulo tiene fecha de entrega cargada en Configuración para esta categoría."
          />
        </div>
      ))}
    </div>
  )
}
