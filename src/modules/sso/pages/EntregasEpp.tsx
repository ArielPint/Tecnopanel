import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileSpreadsheet, Paperclip, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { cn } from '@/lib/utils'
import {
  MOTIVOS_ENTREGA,
  MOTIVO_LABEL,
  exportarEntregasExcel,
  listarCatalogoEpp,
  listarEntregas,
  listarEppVigentes,
  listarItems,
  type ElementoEpp,
  type EntregaV,
  type EppVigente,
  type ItemEntrega,
} from '../lib/apiEpp'
import { listarTrabajadores } from '../lib/apiTrabajadores'
import { fmtFecha, hoyChile } from '../lib/estados'
import { RUTA } from '../lib/rutas'
import type { TrabajadorV } from '../lib/tiposTrabajadores'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useCatalogosTrabajadores } from '../hooks/useCatalogosTrabajadores'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

function desde(meses: number | null): string {
  if (meses === null) return '0000-01-01'
  const h = hoyChile()
  return new Date(Date.UTC(+h.slice(0, 4), +h.slice(5, 7) - 1 - meses, 1)).toISOString().slice(0, 10)
}

/** Registro de entregas: una fila por comprobante, con los elementos entregados. */
export default function EntregasEpp() {
  const navigate = useNavigate()
  const { puede } = usePermisosSso('epp')
  const { empresas } = useCatalogosTrabajadores()
  const [entregas, setEntregas] = useState<EntregaV[]>([])
  const [items, setItems] = useState<ItemEntrega[]>([])
  const [catalogo, setCatalogo] = useState<ElementoEpp[]>([])
  const [trabajadores, setTrabajadores] = useState<TrabajadorV[]>([])
  const [loading, setLoading] = useState(true)

  const [texto, setTexto] = useState('')
  const [periodo, setPeriodo] = useState<number | null>(2)
  const [motivo, setMotivo] = useState('')
  const [empresaId, setEmpresaId] = useState('')

  useEffect(() => {
    Promise.all([listarEntregas(), listarItems(), listarCatalogoEpp(), listarTrabajadores()])
      .then(([e, i, c, t]) => {
        setEntregas(e)
        setItems(i)
        setCatalogo(c)
        setTrabajadores(t)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  const trab = useMemo(() => new Map(trabajadores.map((t) => [t.id, t])), [trabajadores])
  const cat = useMemo(() => new Map(catalogo.map((c) => [c.id, c])), [catalogo])
  const itemsDe = useMemo(() => {
    const m = new Map<string, ItemEntrega[]>()
    for (const i of items) m.set(i.entrega_id, [...(m.get(i.entrega_id) ?? []), i])
    return m
  }, [items])

  const filtradas = useMemo(() => {
    const d = desde(periodo)
    const q = texto.trim().toLowerCase()
    return entregas.filter((e) => {
      const t = trab.get(e.trabajador_id)
      if (e.fecha < d) return false
      if (motivo && e.motivo !== motivo) return false
      if (empresaId && t?.empresa_id !== empresaId) return false
      if (!q) return true
      const elementos = (itemsDe.get(e.id) ?? []).map((i) => cat.get(i.epp_id)?.nombre ?? '').join(' ')
      return `${t?.nombres ?? ''} ${t?.apellidos ?? ''} ${t?.rut ?? ''} ${elementos}`.toLowerCase().includes(q)
    })
  }, [entregas, periodo, motivo, empresaId, texto, trab, itemsDe, cat])

  const unidades = filtradas.reduce((s, e) => s + Number(e.unidades), 0)
  const personas = new Set(filtradas.map((e) => e.trabajador_id)).size
  const sinComprobante = filtradas.filter((e) => !e.comprobante_path).length

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {filtradas.length} entregas · {unidades} unidades · {personas} trabajadores
        {sinComprobante > 0 && <span className="text-amber-700 dark:text-amber-400"> · {sinComprobante} sin comprobante firmado</span>}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_180px_200px_200px_auto]">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Trabajador, RUT o elemento" value={texto} onChange={(e) => setTexto(e.target.value)} className="pl-8" />
        </div>
        <select value={periodo ?? ''} onChange={(e) => setPeriodo(e.target.value === '' ? null : Number(e.target.value))} className={selectClase} aria-label="Período">
          <option value="0">Este mes</option>
          <option value="2">Últimos 3 meses</option>
          <option value="11">Últimos 12 meses</option>
          <option value="">Todo</option>
        </select>
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={selectClase} aria-label="Motivo">
          <option value="">Todos los motivos</option>
          {MOTIVOS_ENTREGA.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className={selectClase} aria-label="Empresa">
          <option value="">Todas las empresas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
        {puede('exportar') && (
          <Button variant="outline" disabled={filtradas.length === 0} onClick={() => exportarEntregasExcel(filtradas, items, catalogo, trabajadores)}>
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : filtradas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {entregas.length === 0 ? 'Todavía no hay entregas registradas.' : 'Ninguna entrega coincide con los filtros.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Trabajador</TableHead>
                  <TableHead>Elementos</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((e) => {
                  const t = trab.get(e.trabajador_id)
                  return (
                    <TableRow key={e.id} className="cursor-pointer" onClick={() => navigate(RUTA.entrega(e.id))}>
                      <TableCell className="whitespace-nowrap">{fmtFecha(e.fecha)}</TableCell>
                      <TableCell>
                        <p className="font-medium">{t ? `${t.apellidos}, ${t.nombres}` : '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          {t?.cargo ?? 'sin cargo'} · {t?.empresa}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-md text-sm">
                        {(itemsDe.get(e.id) ?? [])
                          .map((i) => `${cat.get(i.epp_id)?.nombre ?? '—'}${i.cantidad > 1 ? ` ×${i.cantidad}` : ''}${i.talla ? ` (${i.talla})` : ''}`)
                          .join(', ')}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{MOTIVO_LABEL[e.motivo]}</TableCell>
                      <TableCell>{e.comprobante_path && <Paperclip className="h-4 w-4 text-muted-foreground" aria-label="Con comprobante" />}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Reposiciones pendientes: por trabajador, lo vencido y lo que vence en 15 días según la vida útil. */
export function ReposicionesEpp() {
  const { puede } = usePermisosSso('epp')
  const { empresas } = useCatalogosTrabajadores()
  const [vigentes, setVigentes] = useState<EppVigente[]>([])
  const [catalogo, setCatalogo] = useState<ElementoEpp[]>([])
  const [trabajadores, setTrabajadores] = useState<TrabajadorV[]>([])
  const [loading, setLoading] = useState(true)
  const [empresaId, setEmpresaId] = useState('')

  useEffect(() => {
    Promise.all([listarEppVigentes(), listarCatalogoEpp(), listarTrabajadores()])
      .then(([v, c, t]) => {
        setVigentes(v)
        setCatalogo(c)
        setTrabajadores(t)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  const cat = new Map(catalogo.map((c) => [c.id, c]))
  const grupos = trabajadores
    .filter((t) => t.activo && (!empresaId || t.empresa_id === empresaId))
    .map((t) => ({
      t,
      pendientes: vigentes
        .filter((v) => v.trabajador_id === t.id && v.situacion !== 'vigente' && cat.get(v.epp_id)?.activo)
        .sort((a, b) => (a.reposicion ?? '').localeCompare(b.reposicion ?? '')),
    }))
    .filter((g) => g.pendientes.length > 0)
    .sort((a, b) => (a.pendientes[0].reposicion ?? '').localeCompare(b.pendientes[0].reposicion ?? ''))

  const vencidos = grupos.reduce((s, g) => s + g.pendientes.filter((p) => p.situacion === 'vencido').length, 0)
  const porVencer = grupos.reduce((s, g) => s + g.pendientes.filter((p) => p.situacion === 'por_vencer').length, 0)

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">{vencidos} vencidos</span>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {porVencer} por vencer (15 días)
        </span>
        <span className="text-xs text-muted-foreground">Según la vida útil de cada elemento (trabajadores activos).</span>
        <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className={cn(selectClase, 'ml-auto w-56')} aria-label="Empresa">
          <option value="">Todas las empresas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
      </div>
      {grupos.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">No hay reposiciones pendientes.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {grupos.map(({ t, pendientes }) => (
            <Card key={t.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link to={RUTA.trabajador(t.id)} className="font-semibold hover:underline">
                      {t.apellidos}, {t.nombres}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {t.cargo ?? 'sin cargo'} · {t.empresa}
                    </p>
                  </div>
                  {puede('crear') && (
                    <Button asChild size="sm" variant="outline">
                      <Link to={RUTA.nuevaEntrega(t.id)}>
                        <RefreshCw className="mr-1 h-4 w-4" /> Reponer
                      </Link>
                    </Button>
                  )}
                </div>
                <ul className="space-y-1 text-sm">
                  {pendientes.map((p) => (
                    <li key={p.epp_id} className="flex items-center gap-2">
                      <span className="flex-1">
                        {cat.get(p.epp_id)?.nombre}
                        {p.talla && <span className="text-xs text-muted-foreground"> · talla {p.talla}</span>}
                      </span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          p.situacion === 'vencido' ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
                        )}
                      >
                        {p.situacion === 'vencido' ? 'Venció' : 'Vence'} {fmtFecha(p.reposicion)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
