import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronDown, Circle, Clock, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { cn } from '@/lib/utils'
import { formatearRut } from '@/modules/sso/lib/rut'
import { MesEmpresa } from '../components/ValidacionContratista'
import { DIA_LIMITE_EMPRESA, DOCS_EMPRESA } from '../lib/catalogos'
import { ESTADO_MES, estadoItem, nombreMes, periodoDe, situacionMes, type EstadoItem, type EstadoMes } from '../lib/contratistas'
import { listarDocsEmpresas, listarEmpresas, listarListados, type DocEmpresa, type Empresa, type Listado } from '../lib/api'
import { RUTA } from '../lib/rutas'

const msg = (err: unknown, porDefecto: string) => (err instanceof Error ? err.message : porDefecto)

const ORDEN: Record<EstadoMes, number> = { atrasado: 0, en_revision: 1, pendiente: 2, al_dia: 3 }

const ITEM: Record<EstadoItem, { label: string; clase: string; icono: typeof Clock }> = {
  aprobado: { label: 'Aprobado', clase: 'text-success', icono: CheckCircle2 },
  por_revisar: { label: 'Por revisar', clase: 'text-brand', icono: Clock },
  rechazado: { label: 'Rechazado', clase: 'text-destructive', icono: XCircle },
  falta: { label: 'Falta', clase: 'text-muted-foreground/60', icono: Circle },
}

function Item({ estado }: { estado: EstadoItem }) {
  const it = ITEM[estado]
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', it.clase)} title={it.label}>
      <it.icono className="h-4 w-4 shrink-0" />
      <span className="hidden xl:inline">{it.label}</span>
    </span>
  )
}

/** Documentación del mes de todas las empresas: una fila por empresa con cómo está cada documento;
 *  al abrir la fila se revisa (aprobar / rechazar), se carga o se confirma el listado. */
export default function Documentacion() {
  const [periodo, setPeriodo] = useState(periodoDe)
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [docs, setDocs] = useState<DocEmpresa[]>([])
  const [listados, setListados] = useState<Listado[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<EstadoMes | 'todas'>('todas')
  const [texto, setTexto] = useState('')
  const [abierta, setAbierta] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const [e, d, l] = await Promise.all([listarEmpresas(), listarDocsEmpresas(periodo), listarListados(periodo)])
      setEmpresas(e.filter((x) => x.activa))
      setDocs(d)
      setListados(l)
    } catch (err) {
      toast.error(msg(err, 'Error al cargar'))
    } finally {
      setLoading(false)
    }
  }, [periodo])

  useEffect(() => {
    cargar()
  }, [cargar])

  const situaciones = useMemo(
    () => Object.fromEntries(empresas.map((e) => [e.id, situacionMes(e.id, docs, listados, periodo)])),
    [empresas, docs, listados, periodo],
  )
  const cuenta = (k: EstadoMes) => empresas.filter((e) => situaciones[e.id]?.estado === k).length
  const q = texto.trim().toLowerCase()
  const qRut = q.replace(/[^0-9k]/g, '')
  const visibles = empresas
    .filter((e) => filtro === 'todas' || situaciones[e.id]?.estado === filtro)
    .filter((e) => !q || e.nombre.toLowerCase().includes(q) || (qRut.length >= 4 && (e.rut ?? '').toLowerCase().replace('-', '').includes(qRut)))
    .sort((a, b) => ORDEN[situaciones[a.id].estado] - ORDEN[situaciones[b.id].estado] || a.nombre.localeCompare(b.nombre))
  const columnas = 4 + DOCS_EMPRESA.length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Documentación de {nombreMes(periodo)}</h1>
        <p className="text-sm text-muted-foreground">
          Cada empresa sube su documentación y confirma su listado en su portal (/contratistas). Plazo: día {DIA_LIMITE_EMPRESA} del mes. Abre una fila para
          revisarla.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="month"
          value={periodo.slice(0, 7)}
          onChange={(e) => {
            if (!e.target.value) return
            setPeriodo(`${e.target.value}-01`)
            setAbierta(null)
          }}
          className="h-9 w-40"
          aria-label="Mes"
        />
        {(['todas', 'atrasado', 'en_revision', 'pendiente', 'al_dia'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFiltro(k)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              filtro === k ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {k === 'todas' ? 'Todas' : ESTADO_MES[k].label} <span className="tabular-nums opacity-70">{k === 'todas' ? empresas.length : cuenta(k)}</span>
          </button>
        ))}
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar empresa o RUT" className="ml-auto h-9 w-full sm:w-60" />
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded bg-muted" />
      ) : empresas.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hay empresas contratistas activas. Se agregan en{' '}
          <Link to={RUTA.empresas} className="text-brand hover:underline">
            Empresas
          </Link>
          .
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Empresa</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
                <th className="px-3 py-2 font-semibold">Listado</th>
                {DOCS_EMPRESA.map((t) => (
                  <th key={t.key} className="px-3 py-2 font-semibold" title={t.label}>
                    {t.corto}
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((e) => {
                const s = situaciones[e.id]
                const propios = docs.filter((d) => d.empresa_id === e.id)
                const listado = listados.find((l) => l.empresa_id === e.id)
                const abierto = abierta === e.id
                return (
                  <Fragment key={e.id}>
                    <tr
                      className={cn('cursor-pointer border-b last:border-0 hover:bg-accent/50', abierto && 'bg-accent/40')}
                      onClick={() => setAbierta(abierto ? null : e.id)}
                    >
                      <td className="px-3 py-2">
                        <Link to={RUTA.contratista(e.id)} onClick={(ev) => ev.stopPropagation()} className="font-semibold hover:underline">
                          {e.nombre}
                        </Link>
                        {e.rut && <p className="font-mono-tabular text-xs text-muted-foreground">{formatearRut(e.rut)}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={ESTADO_MES[s.estado].variant}>{ESTADO_MES[s.estado].label}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Item estado={estadoItem(listado ? [listado] : [])} />
                      </td>
                      {DOCS_EMPRESA.map((t) => (
                        <td key={t.key} className="px-3 py-2">
                          <Item estado={estadoItem(propios.filter((d) => d.tipo === t.key))} />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant={s.porRevisar.length ? 'default' : 'outline'} className="h-8 text-xs" aria-expanded={abierto}>
                          {s.porRevisar.length ? `Revisar (${s.porRevisar.length})` : 'Ver'}
                          <ChevronDown className={cn('ml-1 h-3.5 w-3.5 transition-transform', abierto && 'rotate-180')} />
                        </Button>
                      </td>
                    </tr>
                    {abierto && (
                      <tr className="border-b bg-muted/30 last:border-0">
                        <td colSpan={columnas} className="px-3 py-3">
                          <MesEmpresa empresa={e} periodo={periodo} docs={propios} listado={listado} recargar={cargar} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={columnas} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No hay empresas con este filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
