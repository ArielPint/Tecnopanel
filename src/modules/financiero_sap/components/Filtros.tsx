import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { MESES } from '@/modules/financiero/utils/formatters'
import { LINEAS } from '../lib/catalogos'
import { SIN_FILTROS, type Filtros as FiltrosCeco } from '../lib/eerr'
import type { Catalogos, EstadoSync } from '../lib/api'

// Filtros del portal, compartidos entre pantallas (se mantienen al cambiar de pestaña).

export interface Periodo {
  anio: number
  mesDesde: number
  mesHasta: number
  prorratear: boolean
}

/** Balance: saldos al cierre de un mes, con un comparativo. */
export type Comparar = 'dic_anterior' | 'anio_anterior' | 'ninguno'
export interface CorteBalance {
  anio: number
  mes: number
  comparar: Comparar
}

interface Valor {
  periodo: Periodo
  setPeriodo: (p: Periodo) => void
  filtros: FiltrosCeco
  setFiltros: (f: FiltrosCeco) => void
  corte: CorteBalance
  setCorte: (c: CorteBalance) => void
}

const Ctx = createContext<Valor | null>(null)

function periodoInicial(): Periodo {
  const hoy = new Date()
  return { anio: hoy.getFullYear(), mesDesde: 1, mesHasta: hoy.getMonth() + 1, prorratear: true }
}

// El mes en curso no está cerrado: el balance parte en el mes anterior.
function corteInicial(): CorteBalance {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return { anio: d.getFullYear(), mes: d.getMonth() + 1, comparar: 'dic_anterior' }
}

export function FiltrosProvider({ children }: { children: React.ReactNode }) {
  const [periodo, setPeriodo] = useState<Periodo>(periodoInicial)
  const [filtros, setFiltros] = useState<FiltrosCeco>(SIN_FILTROS)
  const [corte, setCorte] = useState<CorteBalance>(corteInicial)
  const valor = useMemo(() => ({ periodo, setPeriodo, filtros, setFiltros, corte, setCorte }), [periodo, filtros, corte])
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useFiltros() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useFiltros fuera de FiltrosProvider')
  const { periodo } = v
  const mm = (m: number) => String(m).padStart(2, '0')
  return { ...v, desde: `${periodo.anio}-${mm(periodo.mesDesde)}`, hasta: `${periodo.anio}-${mm(periodo.mesHasta)}` }
}

// Radix Select no acepta '' como valor: la dimensión 2 vacía ('sin tarea WIP') va con su propia marca.
const TODOS = '__todos'
const VACIO = '__vacio'
const opcion = (v: string | null) => (v === null ? TODOS : v === '' ? VACIO : v)
const desdeOpcion = (v: string) => (v === TODOS ? null : v === VACIO ? '' : v)

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

interface Props {
  catalogos: Catalogos | null
  estado: EstadoSync | null
  /** Sucursales donde el usuario tiene el informe */
  sucursales: string[]
  /** Muestra el selector de prorrateo */
  conProrrateo?: boolean
  /** Muestra los filtros de CECO y dimensión 2 */
  detalle?: boolean
}

export default function BarraFiltros({ catalogos, estado, sucursales, conProrrateo = true, detalle = true }: Props) {
  const { periodo, setPeriodo, filtros, setFiltros } = useFiltros()

  const anios = useMemo(() => {
    const primero = estado?.primer_periodo ? Number(estado.primer_periodo.slice(0, 4)) : new Date().getFullYear()
    const ultimo = estado?.ultimo_periodo ? Number(estado.ultimo_periodo.slice(0, 4)) : new Date().getFullYear()
    const lista: number[] = []
    for (let a = ultimo; a >= primero; a--) lista.push(a)
    return lista
  }, [estado])

  // Si el año elegido no tiene datos (p. ej. recién empieza el año), se va al último con datos.
  useEffect(() => {
    if (anios.length > 0 && !anios.includes(periodo.anio)) {
      const anio = anios[0]
      const ultimoMes = estado?.ultimo_periodo && Number(estado.ultimo_periodo.slice(0, 4)) === anio ? Number(estado.ultimo_periodo.slice(5, 7)) : 12
      setPeriodo({ ...periodo, anio, mesDesde: 1, mesHasta: ultimoMes })
    }
  }, [anios, estado, periodo, setPeriodo])

  const cecos = useMemo(
    () =>
      (catalogos?.cecos ?? []).filter(
        (c) => (filtros.linea === null || c.linea === filtros.linea) && (filtros.sucursal === null || c.sucursal === filtros.sucursal),
      ),
    [catalogos, filtros.linea, filtros.sucursal],
  )

  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
      <Campo label="Año">
        <Select value={String(periodo.anio)} onValueChange={(v) => setPeriodo({ ...periodo, anio: Number(v) })}>
          <SelectTrigger className="h-9 w-full min-w-0 overflow-hidden [&>span]:truncate"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anios.map((a) => (
              <SelectItem key={a} value={String(a)}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>
      <Campo label="Desde">
        <Select
          value={String(periodo.mesDesde)}
          onValueChange={(v) => setPeriodo({ ...periodo, mesDesde: Number(v), mesHasta: Math.max(Number(v), periodo.mesHasta) })}
        >
          <SelectTrigger className="h-9 w-full min-w-0 overflow-hidden [&>span]:truncate"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES.map((m, i) => (
              <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>
      <Campo label="Hasta">
        <Select
          value={String(periodo.mesHasta)}
          onValueChange={(v) => setPeriodo({ ...periodo, mesHasta: Number(v), mesDesde: Math.min(Number(v), periodo.mesDesde) })}
        >
          <SelectTrigger className="h-9 w-full min-w-0 overflow-hidden [&>span]:truncate"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES.map((m, i) => (
              <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>
      <Campo label="Sucursal">
        <Select value={opcion(filtros.sucursal)} onValueChange={(v) => setFiltros({ ...filtros, sucursal: desdeOpcion(v), ceco: null })}>
          <SelectTrigger className="h-9 w-full min-w-0 overflow-hidden [&>span]:truncate"><SelectValue /></SelectTrigger>
          <SelectContent>
            {sucursales.length > 1 && <SelectItem value={TODOS}>Todas</SelectItem>}
            {sucursales.length === 1 && <SelectItem value={TODOS}>{sucursales[0]}</SelectItem>}
            {sucursales.length > 1 && sucursales.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </Campo>
      <Campo label="Línea">
        <Select value={opcion(filtros.linea)} onValueChange={(v) => setFiltros({ ...filtros, linea: desdeOpcion(v), ceco: null })}>
          <SelectTrigger className="h-9 w-full min-w-0 overflow-hidden [&>span]:truncate"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas</SelectItem>
            {LINEAS.map((l) => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>
      {detalle && (
        <Campo label="CECO">
          <Select value={opcion(filtros.ceco)} onValueChange={(v) => setFiltros({ ...filtros, ceco: desdeOpcion(v) })}>
            <SelectTrigger className="h-9 w-full min-w-0 overflow-hidden [&>span]:truncate"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {cecos.map((c) => (
                <SelectItem key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      )}
      {detalle && (
        <Campo label="Tarea WIP (dim. 2)">
          <Select value={opcion(filtros.dim2)} onValueChange={(v) => setFiltros({ ...filtros, dim2: desdeOpcion(v) })}>
            <SelectTrigger className="h-9 w-full min-w-0 overflow-hidden [&>span]:truncate"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas</SelectItem>
              <SelectItem value={VACIO}>Sin tarea WIP</SelectItem>
              {(catalogos?.dim2 ?? []).map((d) => (
                <SelectItem key={d.codigo} value={d.codigo}>{d.codigo} · {d.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      )}
      {conProrrateo && (
        <Campo label="Administración">
          <Select value={periodo.prorratear ? 'si' : 'no'} onValueChange={(v) => setPeriodo({ ...periodo, prorratear: v === 'si' })}>
            <SelectTrigger className="h-9 w-full min-w-0 overflow-hidden [&>span]:truncate"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="si">Prorrateada</SelectItem>
              <SelectItem value="no">Aparte, sin prorratear</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
      )}
    </div>
  )
}

const mm = (m: number) => String(m).padStart(2, '0')

/** Fecha de corte del balance y su comparativo, como 'YYYY-MM'. */
export function useCorte() {
  const { corte, setCorte } = useFiltros()
  const actual = `${corte.anio}-${mm(corte.mes)}`
  const comparativo =
    corte.comparar === 'dic_anterior' ? `${corte.anio - 1}-12` : corte.comparar === 'anio_anterior' ? `${corte.anio - 1}-${mm(corte.mes)}` : null
  return { corte, setCorte, actual, comparativo, cortes: comparativo ? [actual, comparativo] : [actual] }
}

/** 'YYYY-MM' -> 'al 30-09-2026' (último día del mes) */
export function etiquetaCorte(clave: string): string {
  const [a, m] = clave.split('-').map(Number)
  const ultimo = new Date(a, m, 0).getDate()
  return `${String(ultimo).padStart(2, '0')}-${mm(m)}-${a}`
}

export function BarraCorte({ estado }: { estado: EstadoSync | null }) {
  const { corte, setCorte } = useCorte()
  const anios = useMemo(() => {
    const ultimo = estado?.ultimo_periodo ? Number(estado.ultimo_periodo.slice(0, 4)) : new Date().getFullYear()
    const primero = estado?.primer_periodo ? Number(estado.primer_periodo.slice(0, 4)) : ultimo
    const lista: number[] = []
    for (let a = ultimo; a >= primero; a--) lista.push(a)
    return lista
  }, [estado])
  const clase = 'h-9 w-full min-w-0 overflow-hidden [&>span]:truncate'
  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
      <Campo label="Año">
        <Select value={String(corte.anio)} onValueChange={(v) => setCorte({ ...corte, anio: Number(v) })}>
          <SelectTrigger className={clase}><SelectValue /></SelectTrigger>
          <SelectContent>
            {anios.map((a) => (
              <SelectItem key={a} value={String(a)}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>
      <Campo label="Al cierre de">
        <Select value={String(corte.mes)} onValueChange={(v) => setCorte({ ...corte, mes: Number(v) })}>
          <SelectTrigger className={clase}><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES.map((m, i) => (
              <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>
      <Campo label="Comparar con">
        <Select value={corte.comparar} onValueChange={(v) => setCorte({ ...corte, comparar: v as Comparar })}>
          <SelectTrigger className={clase}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dic_anterior">Diciembre {corte.anio - 1}</SelectItem>
            <SelectItem value="anio_anterior">{MESES[corte.mes - 1]} {corte.anio - 1}</SelectItem>
            <SelectItem value="ninguno">Sin comparativo</SelectItem>
          </SelectContent>
        </Select>
      </Campo>
    </div>
  )
}
