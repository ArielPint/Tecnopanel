import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Package } from 'lucide-react'
import { Input } from '@/modules/financiero/components/ui/input'
import { Button } from '@/modules/financiero/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Badge } from '@/modules/financiero/components/ui/badge'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import { formatCLP, formatCLPCompact, formatFecha } from '@/modules/financiero/utils/formatters'
import { useDespachosGD } from '../hooks/useDespachosGD'
import { useModulosTerminados } from '../hooks/useModulosTerminados'
import { loadCatalogoModulos, type CatalogoModulos } from '../lib/catalogoModulos'
import FormularioDespachoGD from '../components/FormularioDespachoGD'
import { useAuth } from '../hooks/useAuth'

type SortCol = 'fecha_gd' | 'fecha_despacho' | 'gd_numero' | 'cantidad' | 'monto_neto' | 'modulo' | 'torre' | 'tipo' | 'avance'

const MES_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export default function DespachoGD() {
  const { perfil, puedeEditar } = useAuth()
  const { despachos, loading, error, crear, actualizar, eliminar } = useDespachosGD()
  const modulosTerminados = useModulosTerminados()
  const [catalogo, setCatalogo] = useState<CatalogoModulos>({ modulos: {}, torres: [] })
  const [search, setSearch] = useState('')
  const [mes, setMes] = useState('')
  const [torre, setTorre] = useState('')
  const [tipo, setTipo] = useState('')
  const [sortCol, setSortCol] = useState<SortCol | null>('fecha_gd')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    loadCatalogoModulos()
      .then(setCatalogo)
      .catch((e) => {
        console.error('DespachoGD: fallo al cargar catálogo de módulos', e)
        toast.error('No se pudo cargar el catálogo de módulos (torre/tipo/serie)')
      })
  }, [])

  const conAcumulado = useMemo(() => {
    let acum = 0
    return despachos.map((d) => {
      acum += d.cantidad || 1
      return { ...d, _acum: acum }
    })
  }, [despachos])

  const mesesDisponibles = useMemo(() => {
    const keys = new Map<string, string>()
    for (const d of despachos) {
      if (!d.fecha_gd) continue
      const [y, m] = d.fecha_gd.split('-')
      const k = `${y}-${m}`
      if (!keys.has(k)) keys.set(k, `${MES_ABBR[parseInt(m) - 1]} ${y}`)
    }
    return [...keys.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [despachos])

  const stats = useMemo(() => {
    const total = despachos.reduce((s, d) => s + (d.cantidad || 1), 0)
    const monto = despachos.reduce((s, d) => s + (d.monto_neto || 0), 0)
    const now = new Date()
    const esteMes = despachos
      .filter((d) => {
        if (!d.fecha_gd) return false
        const dt = new Date(d.fecha_gd + 'T00:00:00')
        return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth()
      })
      .reduce((s, d) => s + (d.cantidad || 1), 0)
    const ultimo = despachos.length ? despachos[despachos.length - 1].fecha_gd : null
    return { total, monto, esteMes, ultimo }
  }, [despachos])

  const filtrados = useMemo(() => {
    const q = search.toLowerCase()
    let rows = conAcumulado.filter((d) => {
      if (q) {
        const hay = [d.gd_numero, d.modulo, d.modulo_nro_serie, d.torre].map((v) => (v || '').toLowerCase()).join(' ')
        if (!hay.includes(q)) return false
      }
      if (mes && d.fecha_gd) {
        const [y, m] = d.fecha_gd.split('-')
        if (`${y}-${m}` !== mes) return false
      }
      if (torre && d.torre !== torre) return false
      if (tipo && d.tipo !== tipo) return false
      return true
    })
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        let va: string | number = a[sortCol] ?? ''
        let vb: string | number = b[sortCol] ?? ''
        if (sortCol === 'cantidad' || sortCol === 'monto_neto' || sortCol === 'avance') {
          va = parseFloat(String(va)) || 0
          vb = parseFloat(String(vb)) || 0
        }
        if (sortCol === 'gd_numero') {
          va = parseInt(String(va)) || 0
          vb = parseInt(String(vb)) || 0
        }
        const cmp = va < vb ? -1 : va > vb ? 1 : 0
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return rows
  }, [conAcumulado, search, mes, torre, tipo, sortCol, sortDir])

  function onSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  async function onDelete(id: number) {
    if (!confirm('¿Eliminar este registro?')) return
    try {
      await eliminar(id)
      toast.success('Registro eliminado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  if (error) return <p className="text-destructive">{error}</p>

  const hayFiltros = !!search || !!mes || !!torre || !!tipo

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Total módulos</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{stats.total}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Monto total neto</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-success">{formatCLPCompact(stats.monto)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Despachos este mes</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-warning">{stats.esteMes}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Último despacho</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-destructive">{stats.ultimo ? formatFecha(stats.ultimo) : '—'}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="🔍  GD #, módulo, serie…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-56" />
        <Select value={mes || '__all'} onValueChange={(v) => setMes(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Todos los meses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos los meses</SelectItem>
            {mesesDisponibles.map(([k, lbl]) => (
              <SelectItem key={k} value={k}>{lbl}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={torre || '__all'} onValueChange={(v) => setTorre(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Todas las torres" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas las torres</SelectItem>
            {catalogo.torres.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tipo || '__all'} onValueChange={(v) => setTipo(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-9 w-32"><SelectValue placeholder="Todos los tipos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos los tipos</SelectItem>
            <SelectItem value="SECO">SECO</SelectItem>
            <SelectItem value="HUMEDO">HÚMEDO</SelectItem>
          </SelectContent>
        </Select>
        {hayFiltros && (
          <Button variant="outline" size="sm" onClick={() => { setSearch(''); setMes(''); setTorre(''); setTipo('') }}>
            ✕ Limpiar
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtrados.length < despachos.length ? `${filtrados.length} de ${despachos.length} registros` : `${despachos.length} registros`}
        </span>
        {puedeEditar && (
          <FormularioDespachoGD despachos={despachos} catalogo={catalogo} modulosTerminados={modulosTerminados} onCreate={(i) => crear(i, perfil?.name ?? 'anon')} onUpdate={actualizar} />
        )}
      </div>

      {!loading && filtrados.length === 0 ? (
        <EmptyState icon={Package} title={hayFiltros ? 'Ningún registro coincide con el filtro' : 'Todavía no hay despachos registrados'} />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead label="Fecha GD" col="fecha_gd" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                <SortHead label="Fecha Despacho" col="fecha_despacho" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                <SortHead label="GD #" col="gd_numero" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                <TableHead>Nro Serie</TableHead>
                <SortHead label="Cant" col="cantidad" sortCol={sortCol} sortDir={sortDir} onSort={onSort} className="text-center" />
                <SortHead label="Monto Neto" col="monto_neto" sortCol={sortCol} sortDir={sortDir} onSort={onSort} className="text-right" />
                <SortHead label="Módulo" col="modulo" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                <SortHead label="Torre" col="torre" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                <SortHead label="Tipo" col="tipo" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                <SortHead label="Avance" col="avance" sortCol={sortCol} sortDir={sortDir} onSort={onSort} className="text-center" />
                <TableHead className="text-center">Acum</TableHead>
                {puedeEditar && <TableHead />}
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton columns={11 + (puedeEditar ? 1 : 0)} />
            ) : (
              <TableBody>
                {filtrados.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{formatFecha(d.fecha_gd)}</TableCell>
                    <TableCell>{formatFecha(d.fecha_despacho)}</TableCell>
                    <TableCell className="font-mono text-primary">{d.gd_numero ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{d.modulo_nro_serie ?? '—'}</TableCell>
                    <TableCell className="text-center">{d.cantidad ?? 1}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(d.monto_neto)}</TableCell>
                    <TableCell className="font-medium">{d.modulo ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.torre ?? '—'}</TableCell>
                    <TableCell>{d.tipo ? <Badge variant={d.tipo === 'SECO' ? 'secondary' : 'success'}>{d.tipo}</Badge> : '—'}</TableCell>
                    <TableCell className="text-center">{d.avance != null ? `${d.avance}%` : '—'}</TableCell>
                    <TableCell className="text-center font-semibold text-warning">{d._acum}</TableCell>
                    {puedeEditar && (
                      <TableCell>
                        <div className="flex gap-2">
                          <FormularioDespachoGD despacho={d} despachos={despachos} catalogo={catalogo} modulosTerminados={modulosTerminados} onCreate={(i) => crear(i, perfil?.name ?? 'anon')} onUpdate={actualizar} />
                          <Button variant="outline" size="sm" onClick={() => onDelete(d.id)}>✕</Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </div>
      )}
    </div>
  )
}

function SortHead({
  label, col, sortCol, sortDir, onSort, className,
}: {
  label: string
  col: SortCol
  sortCol: SortCol | null
  sortDir: 'asc' | 'desc'
  onSort: (col: SortCol) => void
  className?: string
}) {
  const active = sortCol === col
  return (
    <TableHead className={`cursor-pointer select-none ${className ?? ''}`} onClick={() => onSort(col)}>
      {label} <span className={active ? 'text-primary' : 'text-muted-foreground'}>{active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
    </TableHead>
  )
}
