import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'
import { useObraCrData } from '../hooks/useObraCrData'
import { buildEntregasFlat, semanaInicioDe } from '../lib/matrix'
import { ASIGNACION_DEFS, ASIGNACION_ORDER, SUBCONTRATO_LABEL, type AsignacionCategoria, type ObraSubcontrato } from '../lib/categorias'
import CalendarioEntregas from '../components/CalendarioEntregas'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'

function fmtSemana(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

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
  const entregasTodas = useMemo(() => buildEntregasFlat(modulos), [modulos])
  // Con subcontrato asociado: solo "terminaciones" aplica (las otras 3 categorías
  // son de otras empresas fijas), filtrado además al código propio (W/C).
  const categorias = subcontrato ? (['terminaciones'] as AsignacionCategoria[]) : ASIGNACION_ORDER

  const semanas = useMemo(
    () => [...new Set(entregasTodas.map((e) => semanaInicioDe(e.fecha)))].sort(),
    [entregasTodas],
  )
  const [semana, setSemana] = useState<string>('todas')

  const entregas = useMemo(
    () => (semana === 'todas' ? entregasTodas : entregasTodas.filter((e) => semanaInicioDe(e.fecha) === semana)),
    [entregasTodas, semana],
  )

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Calendario armado a partir de las fechas de entrega cargadas por módulo y categoría en la pestaña Configuración.</p>
        <Select value={semana} onValueChange={setSemana}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Semana" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las semanas</SelectItem>
            {semanas.map((s) => (
              <SelectItem key={s} value={s}>Semana del {fmtSemana(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
