import { useMemo, useState, type ReactNode } from 'react'
import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { fmtDate, fmtPr } from '../lib/format'
import { useProduccionModulos, type ProduccionModulo } from '../hooks/useProduccionModulos'
import type { ParsedDashboardData } from '../lib/excelParser'

type SortKey = 'modulo' | 'torre' | 'tipo' | 'avance' | 'termPlan' | 'diasRetraso' | 'nPendientes'
type EstadoFiltro = 'Todos' | 'Terminado' | 'En proceso' | 'Sin iniciar' | 'Atrasado'

function estadoDe(m: ProduccionModulo): EstadoFiltro {
  if (m.terminado) return 'Terminado'
  if (m.diasRetraso > 0) return 'Atrasado'
  if (m.iniciado) return 'En proceso'
  return 'Sin iniciar'
}

function EstadoBadge({ m }: { m: ProduccionModulo }) {
  const e = estadoDe(m)
  const cls =
    e === 'Terminado' ? 'bg-success/15 text-success' : e === 'Atrasado' ? 'bg-destructive/15 text-destructive' : e === 'En proceso' ? 'bg-info/15 text-info' : 'bg-muted text-muted-foreground'
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{e}</span>
}

function sortValue(m: ProduccionModulo, key: SortKey): number | string {
  if (key === 'termPlan') {
    const d = m.termPlan ? new Date(String(m.termPlan)).getTime() : NaN
    return isNaN(d) ? -Infinity : d
  }
  if (key === 'avance' || key === 'diasRetraso' || key === 'nPendientes') return m[key]
  return String(m[key] ?? '')
}

export default function ProduccionDetalle({ excelData }: { excelData: ParsedDashboardData | null }) {
  const { modulos, loading } = useProduccionModulos(excelData)
  const [busqueda, setBusqueda] = useState('')
  const [torre, setTorre] = useState('Todas')
  const [tipo, setTipo] = useState('Todos')
  const [estado, setEstado] = useState<EstadoFiltro>('Todos')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'modulo', dir: 1 })

  const torres = useMemo(() => ['Todas', ...new Set(modulos.map((m) => m.torre).filter(Boolean))].sort(), [modulos])
  const tipos = useMemo(() => ['Todos', ...new Set(modulos.map((m) => m.tipo).filter(Boolean))], [modulos])

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase()
    const rows = modulos.filter((m) => {
      if (torre !== 'Todas' && m.torre !== torre) return false
      if (tipo !== 'Todos' && m.tipo !== tipo) return false
      if (estado !== 'Todos' && estadoDe(m) !== estado) return false
      if (q && !`${m.modulo} ${m.torre} ${m.tipo}`.toLowerCase().includes(q)) return false
      return true
    })
    rows.sort((a, b) => {
      const av = sortValue(a, sort.key)
      const bv = sortValue(b, sort.key)
      if (av < bv) return -1 * sort.dir
      if (av > bv) return 1 * sort.dir
      return 0
    })
    return rows.slice(0, 400)
  }, [modulos, busqueda, torre, tipo, estado, sort])

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))
  }

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>

  function Th({ sortKey, children }: { sortKey?: SortKey; children: ReactNode }) {
    return (
      <th
        className={'px-2 py-1.5 text-left whitespace-nowrap select-none' + (sortKey ? ' cursor-pointer' : '')}
        onClick={sortKey ? () => toggleSort(sortKey) : undefined}
      >
        {children}{sortKey && sort.key === sortKey ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
      </th>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar módulo, torre..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="h-9 max-w-56" />
        <Select value={torre} onValueChange={setTorre}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{torres.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{tipos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={estado} onValueChange={(v) => setEstado(v as EstadoFiltro)}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(['Todos', 'Terminado', 'En proceso', 'Sin iniciar', 'Atrasado'] as EstadoFiltro[]).map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtrados.length} de {modulos.length} módulos (máx. 400)</span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <Th sortKey="torre">Torre</Th>
              <Th sortKey="modulo">Módulo</Th>
              <Th sortKey="tipo">Tipo</Th>
              <Th sortKey="avance">% Avance</Th>
              <Th>OG</Th><Th>San</Th><Th>Elec</Th><Th>Term</Th>
              <Th>Inicio real</Th>
              <Th sortKey="termPlan">Término plan</Th>
              <Th>Estado</Th>
              <Th sortKey="diasRetraso">Días ret.</Th>
              <Th sortKey="nPendientes">Pendientes</Th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((m) => (
              <tr key={m.modulo} className="border-b last:border-0">
                <td className="px-2 py-1.5">{m.torre}</td>
                <td className="px-2 py-1.5">{m.modulo}</td>
                <td className="px-2 py-1.5">{m.tipo || '—'}</td>
                <td className="px-2 py-1.5 tabular-nums">{(m.avance * 100).toFixed(1)}%</td>
                <td className="px-2 py-1.5 tabular-nums">{fmtPr(m.og * 100)}</td>
                <td className="px-2 py-1.5 tabular-nums">{fmtPr(m.san * 100)}</td>
                <td className="px-2 py-1.5 tabular-nums">{fmtPr(m.elec * 100)}</td>
                <td className="px-2 py-1.5 tabular-nums">{fmtPr(m.term * 100)}</td>
                <td className="px-2 py-1.5">{fmtDate(m.initReal)}</td>
                <td className="px-2 py-1.5">{fmtDate(m.termPlan)}</td>
                <td className="px-2 py-1.5"><EstadoBadge m={m} /></td>
                <td className={'px-2 py-1.5 tabular-nums ' + (m.diasRetraso > 0 ? 'text-destructive' : '')}>{m.diasRetraso > 0 ? `${m.diasRetraso}d` : '—'}</td>
                <td className="px-2 py-1.5 tabular-nums">{m.nPendientes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
