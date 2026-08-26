import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { usePermisosProyecto } from '@/hooks/usePermisosProyecto'
import { useObraCrData } from '../hooks/useObraCrData'
import { ASIGNACION_POR_CR_CATEGORIA, CATEGORY_DEFS } from '../lib/categorias'
import { buildCategoryTable, isModuloTerminado, type ModuloCombinado } from '../lib/matrix'
import type { ObraCategoria } from '../lib/categorias'
import type { ChipEstado } from '../lib/crParser'

const ORDEN: ObraCategoria[] = ['electrico', 'sanitario', 'wedo', 'conbes', 'ventanas']
// Sección "wedo"/"conbes" correspondiente al valor del permiso — un usuario con
// subcontrato asociado solo ve la suya (las otras 3 categorías son de otras empresas).
const SECCION_POR_SUBCONTRATO: Record<'WEDO' | 'CONBES', ObraCategoria> = { WEDO: 'wedo', CONBES: 'conbes' }

function fmtFecha(iso: string | null): string {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function Chip({ status }: { status: ChipEstado }) {
  if (status === 'na') return <span className="mx-auto flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground">–</span>
  const ok = status === 'ok'
  return (
    <span className={`mx-auto flex size-5 items-center justify-center rounded-full text-xs font-bold ${ok ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>
      {ok ? '✓' : '✕'}
    </span>
  )
}

function Kpi({ label, pct, frac }: { label: string; pct: string; frac: string }) {
  return (
    <div className="min-w-36 flex-1 rounded-lg border bg-card p-4">
      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{pct}%</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{frac}</p>
    </div>
  )
}

function CategoriaSection({ cat, modulos }: { cat: ObraCategoria; modulos: ModuloCombinado[] }) {
  const [filtro, setFiltro] = useState('')
  const tabla = useMemo(() => buildCategoryTable(cat, modulos), [cat, modulos])
  const pct = tabla.total ? ((100 * tabla.done) / tabla.total).toFixed(1) : '0.0'
  const asigCat = ASIGNACION_POR_CR_CATEGORIA[cat]

  const colsVisibles = useMemo(() => {
    if (!filtro.trim()) return tabla.cols.map((_, i) => i)
    const q = filtro.trim()
    return tabla.cols.reduce<number[]>((acc, c, i) => {
      if (String(c.moduloNum).padStart(3, '0').includes(q) || String(c.moduloNum).includes(q)) acc.push(i)
      return acc
    }, [])
  }, [tabla.cols, filtro])

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {CATEGORY_DEFS[cat].label} <span className="ml-2 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-bold text-warning">{pct}% AVANCE</span>
          </h3>
          <Input placeholder="Buscar módulo (ej: 093)" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-8 w-44 text-xs" />
        </div>

        {!tabla.rows.length || !tabla.cols.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {tabla.cols.length ? 'Sin partidas reconocidas para esta categoría en el último CR subido.' : 'Sin módulos asignados a este subcontrato en Configuración.'}
          </p>
        ) : (
          <div className="max-h-[70vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 top-0 z-20 min-w-52 bg-background">Partida</TableHead>
                  {colsVisibles.map((i) => {
                    const c = tabla.cols[i]
                    const fecha = c.asignaciones[asigCat].fechaEntrega
                    return (
                      <TableHead key={c.moduloNum} className="sticky top-0 z-10 bg-background text-center">
                        {fecha && <span className="block text-[.65rem] text-muted-foreground">{fmtFecha(fecha)}</span>}
                        {c.code}
                      </TableHead>
                    )
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tabla.rows.map((row) => (
                  <TableRow key={row.nombre}>
                    <TableCell className="sticky left-0 z-10 max-w-64 bg-background whitespace-normal">{row.nombre}</TableCell>
                    {colsVisibles.map((i) => (
                      <TableCell key={i} className="text-center">
                        <Chip status={row.cells[i].status} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function PorContratista() {
  const { proyectoSlug } = useParams<{ proyectoSlug: string }>()
  const { subcontrato } = usePermisosProyecto(proyectoSlug ?? '')
  const { modulos: todos, loading, hayCR } = useObraCrData()
  const modulos = useMemo(() => todos.filter((m) => !isModuloTerminado(m)), [todos])
  const orden = subcontrato ? [SECCION_POR_SUBCONTRATO[subcontrato]] : ORDEN

  const kpis = useMemo(() => {
    const porCat = orden.map((cat) => ({ cat, tabla: buildCategoryTable(cat, modulos) }))
    const totalDone = porCat.reduce((s, c) => s + c.tabla.done, 0)
    const totalAll = porCat.reduce((s, c) => s + c.tabla.total, 0)
    return { porCat, generalPct: totalAll ? ((100 * totalDone) / totalAll).toFixed(1) : '0.0', totalDone, totalAll }
  }, [modulos, orden])

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>

  if (!hayCR) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Sin CR cargado todavía — subilo desde la pestaña Configuración.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Kpi label="Avance general" pct={kpis.generalPct} frac={`${kpis.totalDone} / ${kpis.totalAll} celdas partida×módulo`} />
        {kpis.porCat.map(({ cat, tabla }) => (
          <Kpi key={cat} label={CATEGORY_DEFS[cat].label} pct={tabla.total ? ((100 * tabla.done) / tabla.total).toFixed(1) : '0.0'} frac={`${tabla.done} / ${tabla.total}`} />
        ))}
      </div>
      {orden.map((cat) => (
        <CategoriaSection key={cat} cat={cat} modulos={modulos} />
      ))}
    </div>
  )
}
