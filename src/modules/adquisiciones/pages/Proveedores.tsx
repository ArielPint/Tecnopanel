import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { cn } from '@/lib/utils'
import { CLASE, fmtPesos, listarProveedores, type ProveedorFicha } from '../lib/api'
import { RUTA } from '../lib/rutas'
import { DialogoEvaluacion } from '../components/DialogosProveedor'

// Proveedores con OC en SAP (desde el 01-01 del año anterior) o con evaluaciones / NC: compras de los
// últimos 12 meses, pendientes, atrasos, última evaluación y no conformidades.

type Filtro = 'activos' | 'atrasos' | 'sin_evaluar' | 'revision' | 'cd' | 'nc' | 'todos'

export default function Proveedores() {
  const navigate = useNavigate()
  const [filas, setFilas] = useState<ProveedorFicha[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('activos')
  const [texto, setTexto] = useState('')
  const [evaluar, setEvaluar] = useState(false)

  const cargar = () =>
    listarProveedores()
      .then(setFilas)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  useEffect(() => {
    cargar()
  }, [])

  const cumple = (p: ProveedorFicha, f: Filtro) =>
    f === 'todos'
      ? true
      : f === 'activos'
        ? p.oc_12m > 0 || p.oc_abiertas > 0
        : f === 'atrasos'
          ? p.lineas_atrasadas > 0
          : f === 'sin_evaluar'
            ? p.oc_12m > 0 && !p.ultima_clase
            : f === 'revision'
              ? p.revision_vencida
              : f === 'cd'
                ? p.ultima_clase === 'C' || p.ultima_clase === 'D'
                : p.nc_abiertas > 0
  const lista = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return filas.filter((p) => cumple(p, filtro)).filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q) || (p.rut ?? '').toLowerCase().includes(q))
  }, [filas, filtro, texto]) // eslint-disable-line react-hooks/exhaustive-deps

  const FILTROS: [Filtro, string][] = [
    ['activos', 'Con compras en 12 meses'],
    ['atrasos', 'Con atrasos'],
    ['sin_evaluar', 'Sin evaluar'],
    ['revision', 'Revisión vencida'],
    ['cd', 'Clase C o D'],
    ['nc', 'Con NC abiertas'],
    ['todos', 'Todos'],
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">Proveedores</h1>
          <p className="text-sm text-muted-foreground">Compras de SAP, pendientes y atrasos por proveedor, con su última evaluación y sus no conformidades.</p>
        </div>
        <Button size="sm" onClick={() => setEvaluar(true)}>
          <ClipboardCheck className="mr-1 h-4 w-4" /> Evaluar proveedor
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFiltro(k)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              filtro === k ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {label} <span className="tabular-nums opacity-70">{filas.filter((p) => cumple(p, k)).length}</span>
          </button>
        ))}
      </div>
      <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre, RUT o código SAP" className="h-9 w-full sm:w-80" />

      {loading ? (
        <div className="h-40 animate-pulse rounded bg-muted" />
      ) : lista.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No hay proveedores con estos filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Proveedor</th>
                <th className="px-3 py-2 text-right font-semibold">Comprado 12 m</th>
                <th className="px-3 py-2 text-right font-semibold">OC 12 m</th>
                <th className="px-3 py-2 text-right font-semibold">Pendiente</th>
                <th className="px-3 py-2 text-right font-semibold">Líneas atrasadas</th>
                <th className="px-3 py-2 text-right font-semibold">Recepción</th>
                <th className="px-3 py-2 font-semibold">Evaluación</th>
                <th className="px-3 py-2 text-right font-semibold">NC abiertas</th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, 400).map((p) => (
                <tr
                  key={p.codigo}
                  tabIndex={0}
                  onClick={() => navigate(RUTA.proveedor(p.codigo))}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(RUTA.proveedor(p.codigo))}
                  className="cursor-pointer border-b last:border-0 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                >
                  <td className="px-3 py-2">
                    <p className="max-w-[320px] truncate font-semibold" title={p.nombre}>
                      {p.nombre}
                    </p>
                    <p className="font-mono-tabular text-[11px] text-muted-foreground">
                      {p.codigo}
                      {p.rut && ` · ${p.rut}`}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-right font-mono-tabular">{fmtPesos(p.comprado_12m)}</td>
                  <td className="px-3 py-2 text-right font-mono-tabular">{p.oc_12m}</td>
                  <td className="px-3 py-2 text-right font-mono-tabular">{p.pendiente_neto > 0 ? fmtPesos(p.pendiente_neto) : '—'}</td>
                  <td className={cn('px-3 py-2 text-right font-mono-tabular', p.lineas_atrasadas > 0 && 'font-semibold text-destructive')}>{p.lineas_atrasadas || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono-tabular">{p.recepcion_pct == null ? '—' : `${p.recepcion_pct}%`}</td>
                  <td className="px-3 py-2">
                    {p.ultima_clase ? (
                      <div className="flex flex-col items-start gap-0.5">
                        <Badge variant={CLASE[p.ultima_clase].variant}>
                          {p.ultima_clase} · {p.ultima_puntaje?.toLocaleString('es-CL')}
                        </Badge>
                        {p.revision_vencida && <span className="text-[11px] font-semibold text-warning">revisión vencida</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin evaluar</span>
                    )}
                  </td>
                  <td className={cn('px-3 py-2 text-right font-mono-tabular', p.nc_abiertas > 0 && 'font-semibold text-destructive')}>{p.nc_abiertas || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length > 400 && <p className="p-3 text-center text-xs text-muted-foreground">Se muestran 400 de {lista.length}. Usa el buscador.</p>}
        </div>
      )}

      <DialogoEvaluacion abierto={evaluar} proveedor={null} onCerrar={() => setEvaluar(false)} onGuardado={cargar} />
    </div>
  )
}
