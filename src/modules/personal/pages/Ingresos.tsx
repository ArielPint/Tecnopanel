import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Input } from '@/modules/financiero/components/ui/input'
import { SUCURSALES } from '@/lib/lineasNegocio'
import { cn } from '@/lib/utils'
import { formatearRut } from '@/modules/sso/lib/rut'
import { fmtFecha } from '@/modules/sso/lib/estados'
import { SITUACION, type Situacion } from '../lib/catalogos'
import { listarIngresos, type Ingreso } from '../lib/api'
import { RUTA } from '../lib/rutas'

type Filtro = 'abiertos' | Situacion | 'todos'

const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'abiertos', label: 'Abiertos' },
  { key: 'en_proceso', label: SITUACION.en_proceso.label },
  { key: 'listo', label: SITUACION.listo.label },
  { key: 'ingresado', label: 'Ingresados' },
  { key: 'anulado', label: 'Anulados' },
  { key: 'todos', label: 'Todos' },
]

function cumple(i: Ingreso, f: Filtro) {
  if (f === 'todos') return true
  if (f === 'abiertos') return i.situacion === 'en_proceso' || i.situacion === 'listo'
  return i.situacion === f
}

export function Avance({ i }: { i: Ingreso }) {
  const total = i.docs_requeridos + i.tareas_total
  const hechos = Math.min(i.docs_ok, i.docs_requeridos) + i.tareas_hechas
  const pct = total ? Math.round((hechos * 100) / total) : 0
  return (
    <div className="min-w-[140px]">
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full', i.situacion === 'anulado' ? 'bg-muted-foreground/40' : 'bg-brand')} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
        Docs {Math.min(i.docs_ok, i.docs_requeridos)}/{i.docs_requeridos} · Tareas {i.tareas_hechas}/{i.tareas_total}
      </p>
    </div>
  )
}

/** Ingresos que la persona puede ver: los suyos, los de su sucursal o los con tareas de su área. */
export default function Ingresos() {
  const navigate = useNavigate()
  const [ingresos, setIngresos] = useState<Ingreso[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('abiertos')
  const [sucursal, setSucursal] = useState<string>('')
  const [texto, setTexto] = useState('')
  const [soloMias, setSoloMias] = useState(false)

  useEffect(() => {
    listarIngresos()
      .then(setIngresos)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  const porSucursal = useMemo(() => ingresos.filter((i) => !sucursal || i.sucursal === sucursal), [ingresos, sucursal])
  const conTareasMias = porSucursal.filter((i) => i.tareas_mias > 0 && i.estado === 'en_proceso').length
  const lista = useMemo(() => {
    const q = texto.trim().toLowerCase()
    const qRut = q.replace(/[^0-9k]/g, '')
    return porSucursal
      .filter((i) => cumple(i, filtro))
      .filter((i) => !soloMias || (i.tareas_mias > 0 && i.estado === 'en_proceso'))
      .filter(
        (i) =>
          !q ||
          i.nombre.toLowerCase().includes(q) ||
          i.cargo.toLowerCase().includes(q) ||
          String(i.numero) === q ||
          (qRut.length >= 4 && i.rut.toLowerCase().replace('-', '').includes(qRut)),
      )
      // los abiertos, por fecha de ingreso (lo más urgente arriba); el resto, lo más nuevo arriba
      .sort((a, b) =>
        filtro === 'abiertos' || filtro === 'en_proceso' || filtro === 'listo'
          ? a.fecha_ingreso.localeCompare(b.fecha_ingreso)
          : b.created_at.localeCompare(a.created_at),
      )
  }, [porSucursal, filtro, soloMias, texto])

  const cuenta = (f: Filtro) => porSucursal.filter((i) => cumple(i, f)).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Ingresos de personal</h1>
        <p className="text-sm text-muted-foreground">Solicitudes de ingreso y su avance: documentos del trabajador y tareas de cada área.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              filtro === f.key ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label} <span className="tabular-nums opacity-70">{cuenta(f.key)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre, RUT, cargo o N°" className="h-9 w-full sm:w-72" />
        <select
          value={sucursal}
          onChange={(e) => setSucursal(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="Sucursal"
        >
          <option value="">Todas las sucursales</option>
          {SUCURSALES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {conTareasMias > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soloMias} onChange={(e) => setSoloMias(e.target.checked)} className="accent-[hsl(var(--brand))]" />
            Con tareas mías pendientes <span className="text-muted-foreground tabular-nums">({conTareasMias})</span>
          </label>
        )}
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded bg-muted" />
      ) : lista.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {ingresos.length === 0 ? 'Todavía no hay ingresos que puedas ver.' : 'No hay ingresos con estos filtros.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">N°</th>
                <th className="px-3 py-2 font-semibold">Trabajador</th>
                <th className="px-3 py-2 font-semibold">Cargo y área</th>
                <th className="px-3 py-2 font-semibold">Sucursal</th>
                <th className="px-3 py-2 font-semibold">Ingresa</th>
                <th className="px-3 py-2 font-semibold">Avance</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => (
                <tr
                  key={i.id}
                  tabIndex={0}
                  onClick={() => navigate(RUTA.ingreso(i.id))}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(RUTA.ingreso(i.id))}
                  className="cursor-pointer border-b last:border-0 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                >
                  <td className="px-3 py-2.5 font-mono-tabular text-muted-foreground">{i.numero}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold">{i.nombre}</p>
                    <p className="font-mono-tabular text-xs text-muted-foreground">{formatearRut(i.rut)}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p>{i.cargo}</p>
                    <p className="text-xs text-muted-foreground">{i.area}</p>
                  </td>
                  <td className="px-3 py-2.5">{i.sucursal}</td>
                  <td className="px-3 py-2.5 font-mono-tabular">{fmtFecha(i.fecha_ingreso)}</td>
                  <td className="px-3 py-2.5">
                    <Avance i={i} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant={SITUACION[i.situacion].variant}>{SITUACION[i.situacion].label}</Badge>
                      {i.tareas_mias > 0 && i.estado === 'en_proceso' && (
                        <span className="text-[11px] font-semibold text-brand">
                          {i.tareas_mias === 1 ? '1 tarea tuya' : `${i.tareas_mias} tareas tuyas`}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
