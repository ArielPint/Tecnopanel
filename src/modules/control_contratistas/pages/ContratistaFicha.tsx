import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { supabase } from '@/lib/supabaseClient'
import { formatearRut } from '@/modules/sso/lib/rut'
import { fmtFecha } from '@/modules/sso/lib/estados'
import type { TrabajadorV } from '@/modules/sso/lib/tiposTrabajadores'
import { MesEmpresa, TablaEstadosPago } from '../components/ValidacionContratista'
import { usePermisosContratistas } from '../hooks/usePermisosContratistas'
import { ESTADO_MES, nombreMes, periodoDe, situacionMes } from '../lib/contratistas'
import { listarIngresos, type Ingreso } from '@/modules/personal/lib/api'
import { RUTA as RUTA_INGRESO } from '@/modules/personal/lib/rutas'
import {
  listarDocsEmpresas,
  listarEmpresas,
  listarEstadosPagoEmpresas,
  listarListados,
  type DocEmpresa,
  type Empresa,
  type EstadoPagoEmpresa,
  type Listado,
} from '../lib/api'
import { RUTA } from '../lib/rutas'

const msg = (err: unknown, porDefecto: string) => (err instanceof Error ? err.message : porDefecto)

/** Trabajadores de la empresa en Prevención (los carga la empresa desde su portal). */
async function trabajadoresDe(empresaId: string): Promise<TrabajadorV[]> {
  const { data: e } = await supabase.from('sso_empresas').select('id').eq('subcontratista_id', empresaId).maybeSingle()
  if (!e) return []
  const { data, error } = await supabase.from('sso_trabajadores_v').select('*').eq('empresa_id', e.id).order('apellidos')
  if (error) throw new Error(error.message)
  return (data ?? []) as TrabajadorV[]
}

/** Ficha de una empresa contratista: documentación del mes, estados de pago, trabajadores e ingresos. */
export default function ContratistaFicha() {
  const { id = '' } = useParams<{ id: string }>()
  const { validaEp } = usePermisosContratistas()
  const [periodo, setPeriodo] = useState(periodoDe)
  const [empresa, setEmpresa] = useState<Empresa | null | undefined>()
  const [docs, setDocs] = useState<DocEmpresa[]>([])
  const [listados, setListados] = useState<Listado[]>([])
  const [eps, setEps] = useState<EstadoPagoEmpresa[]>([])
  const [trabajadores, setTrabajadores] = useState<TrabajadorV[]>([])
  const [ingresos, setIngresos] = useState<Ingreso[]>([])
  const [verBajas, setVerBajas] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [es, d, l, ep, t, ing] = await Promise.all([
        listarEmpresas(),
        listarDocsEmpresas(periodo),
        listarListados(periodo),
        validaEp ? listarEstadosPagoEmpresas(id) : Promise.resolve([]),
        trabajadoresDe(id),
        listarIngresos().catch(() => [] as Ingreso[]),
      ])
      setEmpresa(es.find((e) => e.id === id) ?? null)
      setDocs(d.filter((x) => x.empresa_id === id))
      setListados(l.filter((x) => x.empresa_id === id))
      setEps(ep)
      setTrabajadores(t)
      setIngresos(ing.filter((i) => i.empresa_id === id))
    } catch (err) {
      toast.error(msg(err, 'Error al cargar'))
      setEmpresa((e) => e ?? null)
    }
  }, [id, periodo, validaEp])

  useEffect(() => {
    cargar()
  }, [cargar])

  const volver = (
    <Link to={RUTA.contratistas} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Volver a contratistas
    </Link>
  )
  if (empresa === undefined) return <div className="h-40 animate-pulse rounded bg-muted" />
  if (!empresa) {
    return (
      <div className="space-y-3">
        {volver}
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">La empresa no existe o no tienes acceso.</p>
      </div>
    )
  }

  const s = situacionMes(empresa.id, docs, listados, periodo)
  const activos = trabajadores.filter((t) => t.activo).length
  const lista = trabajadores.filter((t) => verBajas || t.activo)

  return (
    <div className="space-y-5">
      {volver}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-extrabold">{empresa.nombre}</h1>
          {!empresa.activa && <Badge variant="secondary">Inactiva</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {[empresa.rut && formatearRut(empresa.rut), empresa.email, empresa.telefono, activos === 1 ? '1 trabajador activo' : `${activos} trabajadores activos`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold">Documentación de {nombreMes(periodo)}</h2>
            <Badge variant={ESTADO_MES[s.estado].variant}>{ESTADO_MES[s.estado].label}</Badge>
            <Input
              type="month"
              value={periodo.slice(0, 7)}
              onChange={(e) => e.target.value && setPeriodo(`${e.target.value}-01`)}
              className="ml-auto h-8 w-40"
              aria-label="Mes"
            />
          </div>
          <MesEmpresa empresa={empresa} periodo={periodo} docs={docs} listado={listados[0]} activos={activos} recargar={cargar} />
        </CardContent>
      </Card>

      {validaEp && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">Estados de pago</h2>
          <TablaEstadosPago eps={eps} recargar={cargar} />
        </section>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold">Trabajadores</h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={verBajas} onChange={(e) => setVerBajas(e.target.checked)} className="accent-[hsl(var(--brand))]" />
            Mostrar dados de baja
          </label>
        </div>
        {lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">La empresa todavía no carga trabajadores.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Trabajador</th>
                  <th className="px-3 py-2 font-semibold">Cargo</th>
                  <th className="px-3 py-2 font-semibold">Sucursal</th>
                  <th className="px-3 py-2 font-semibold">Ingreso</th>
                  <th className="px-3 py-2 font-semibold">Contacto</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <p className="font-semibold">
                        {t.nombres} {t.apellidos}
                        {!t.activo && (
                          <Badge variant="secondary" className="ml-2">
                            Baja {fmtFecha(t.fecha_baja)}
                          </Badge>
                        )}
                      </p>
                      <p className="font-mono-tabular text-xs text-muted-foreground">{formatearRut(t.rut)}</p>
                    </td>
                    <td className="px-3 py-2">{t.cargo ?? '—'}</td>
                    <td className="px-3 py-2">{t.sucursal}</td>
                    <td className="px-3 py-2 font-mono-tabular">{fmtFecha(t.fecha_ingreso)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{[t.telefono, t.email].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {ingresos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">Solicitudes de ingreso</h2>
          <ul className="divide-y rounded-md border bg-card">
            {ingresos.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <Link to={RUTA_INGRESO.ingreso(i.id)} className="font-medium text-brand hover:underline">
                  N° {i.numero} · {i.nombre}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {i.cargo} · ingresa el {fmtFecha(i.fecha_ingreso)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
