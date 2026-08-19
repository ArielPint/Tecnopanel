import { useMemo } from 'react'
import { useObraCrData } from '../hooks/useObraCrData'
import { buildEntregasFlat } from '../lib/matrix'
import { ASIGNACION_DEFS, ASIGNACION_ORDER, SUBCONTRATO_LABEL, type AsignacionCategoria } from '../lib/categorias'
import CalendarioEntregas from '../components/CalendarioEntregas'

function tituloCategoria(cat: AsignacionCategoria): string {
  const def = ASIGNACION_DEFS[cat]
  if (!def.subcontratoFijo) return `${def.label} (We Do / Conbes)`
  return `${def.label} (${SUBCONTRATO_LABEL[def.subcontratoFijo]})`
}

export default function EntregaCliente() {
  const { modulos, loading, hayCR } = useObraCrData()
  const entregas = useMemo(() => buildEntregasFlat(modulos), [modulos])

  const porCategoria = useMemo(
    () => ASIGNACION_ORDER.map((cat) => ({ cat, entregas: entregas.filter((e) => e.categoria === cat) })),
    [entregas],
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
