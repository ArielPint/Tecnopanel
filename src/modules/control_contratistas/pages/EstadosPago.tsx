import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/modules/financiero/components/ui/input'
import { cn } from '@/lib/utils'
import { ESTADO_LABEL, ESTADOS_EP } from '@/modules/estados_pago/lib/estadosFlujo'
import type { EstadoEP } from '@/modules/estados_pago/types'
import { TablaEstadosPago } from '../components/ValidacionContratista'
import { usePermisosContratistas } from '../hooks/usePermisosContratistas'
import { epPorValidar } from '../lib/contratistas'
import { listarEmpresas, listarEstadosPagoEmpresas, type Empresa, type EstadoPagoEmpresa } from '../lib/api'

const msg = (err: unknown, porDefecto: string) => (err instanceof Error ? err.message : porDefecto)

type Filtro = 'por_validar' | EstadoEP | 'todos'

/** Estados de pago de todas las empresas, para pasarlos a revisión, aprobarlos, rechazarlos o pagarlos. */
export default function EstadosPago() {
  const { validaEp, loading: cargandoPermisos } = usePermisosContratistas()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [eps, setEps] = useState<EstadoPagoEmpresa[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('por_validar')
  const [texto, setTexto] = useState('')

  const cargar = useCallback(async () => {
    if (!validaEp) return
    try {
      const [e, ep] = await Promise.all([listarEmpresas(), listarEstadosPagoEmpresas()])
      setEmpresas(e)
      setEps(ep)
    } catch (err) {
      toast.error(msg(err, 'Error al cargar'))
    } finally {
      setLoading(false)
    }
  }, [validaEp])

  useEffect(() => {
    cargar()
  }, [cargar])

  const nombre = useMemo(() => {
    const m = new Map(empresas.map((e) => [e.id, e.nombre]))
    return (id: string) => m.get(id) ?? '—'
  }, [empresas])

  if (cargandoPermisos) return <div className="h-40 animate-pulse rounded bg-muted" />
  if (!validaEp) {
    return <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No tienes acceso a los estados de pago.</p>
  }

  const pasa = (ep: EstadoPagoEmpresa, f: Filtro) => f === 'todos' || (f === 'por_validar' ? epPorValidar(ep.estado) : ep.estado === f)
  const q = texto.trim().toLowerCase()
  const visibles = eps
    .filter((ep) => pasa(ep, filtro))
    .filter(
      (ep) =>
        !q ||
        nombre(ep.empresa_id).toLowerCase().includes(q) ||
        ep.proyecto_nombre.toLowerCase().includes(q) ||
        ep.especialidad.toLowerCase().includes(q) ||
        String(ep.numero_ep).includes(q),
    )
  const filtros: { key: Filtro; label: string }[] = [
    { key: 'por_validar', label: 'Por validar' },
    ...ESTADOS_EP.map((k) => ({ key: k as Filtro, label: ESTADO_LABEL[k] })),
    { key: 'todos', label: 'Todos' },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Estados de pago</h1>
        <p className="text-sm text-muted-foreground">
          Los emite cada empresa desde su portal. &quot;Por validar&quot; son los emitidos, en revisión y aprobados sin pagar.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filtros.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              filtro === f.key ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label} <span className="tabular-nums opacity-70">{eps.filter((ep) => pasa(ep, f.key)).length}</span>
          </button>
        ))}
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar empresa, proyecto o N°" className="ml-auto h-9 w-full sm:w-64" />
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded bg-muted" />
      ) : visibles.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {filtro === 'por_validar' && !q ? 'No hay estados de pago por validar.' : 'No hay estados de pago con este filtro.'}
        </p>
      ) : (
        <TablaEstadosPago eps={visibles} nombreEmpresa={nombre} recargar={cargar} />
      )}
    </div>
  )
}
