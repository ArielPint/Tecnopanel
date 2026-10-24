import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, Search, Settings2 } from 'lucide-react'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { formatFecha, formatFechaHora } from '@/modules/financiero/utils/formatters'
import { cn } from '@/lib/utils'
import { Aviso, Cargando } from '../components/Estados'
import { EstadoBadge } from '../components/rendiciones'
import { usePermisosFin } from '../hooks/usePermisosFin'
import { pesos } from '../lib/formato'
import { RUTA } from '../lib/rutas'
import {
  cargarAsiento,
  cargarConfig,
  cargarInformes,
  ESTADOS,
  type EstadoRendicion,
  type EstadoSyncRg,
  type Informe,
  type LineaAsiento,
} from '../lib/rendiciones'

// Bandeja: rendiciones aprobadas en Rindegastos y aún no integradas, con lo que iría al asiento y lo que le falta.

interface Resumen {
  contabilizar: number
  excluido: number
  gastos: number
  sinCuenta: number
  sinCeco: number
}

export default function Rendiciones() {
  const navigate = useNavigate()
  const { rendiciones_aprobar } = usePermisosFin()
  const [informes, setInformes] = useState<Informe[] | null>(null)
  const [lineas, setLineas] = useState<LineaAsiento[]>([])
  const [estadoSync, setEstadoSync] = useState<EstadoSyncRg | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [estado, setEstado] = useState<EstadoRendicion>('pendiente')
  const [buscar, setBuscar] = useState('')

  useEffect(() => {
    let cancelado = false
    Promise.all([cargarInformes(), cargarAsiento(), cargarConfig()])
      .then(([i, l, c]) => {
        if (cancelado) return
        setInformes(i)
        setLineas(l)
        setEstadoSync(c.estado)
      })
      .catch((e) => !cancelado && setError(e))
    return () => {
      cancelado = true
    }
  }, [])

  const resumen = useMemo(() => {
    const m = new Map<number, Resumen>()
    for (const l of lineas) {
      const r = m.get(l.informe_id) ?? { contabilizar: 0, excluido: 0, gastos: 0, sinCuenta: 0, sinCeco: 0 }
      if (l.lado === 'haber') r.contabilizar = l.haber
      else if (l.motivo_exclusion) r.excluido += l.debe
      else {
        r.gastos++
        if (!l.cuenta) r.sinCuenta++
        if (!l.ceco) r.sinCeco++
      }
      m.set(l.informe_id, r)
    }
    return m
  }, [lineas])

  const conteo = useMemo(() => {
    const c: Record<EstadoRendicion, number> = { pendiente: 0, observado: 0, aprobado: 0 }
    for (const i of informes ?? []) c[i.estado]++
    return c
  }, [informes])

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return (informes ?? []).filter(
      (i) =>
        i.estado === estado &&
        (!q || [i.folio, i.titulo, i.empleado_nombre, i.empleado_email].some((t) => t?.toLowerCase().includes(q))),
    )
  }, [informes, estado, buscar])

  if (error) return <Aviso error={error} />
  if (!informes) return <Cargando />

  const totalVisible = visibles.reduce((s, i) => s + (resumen.get(i.id)?.contabilizar ?? 0), 0)

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Rendiciones aprobadas en Rindegastos que aún no están en SAP. Revisa el asiento propuesto de cada una, corrige cuenta o centro de
        costo si hace falta y apruébala. Por ahora nada se carga en SAP: la carga llega en la fase 2.
      </p>

      {estadoSync?.mensaje && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>{estadoSync.mensaje}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
          {ESTADOS.map((e) => (
            <button
              key={e.key}
              onClick={() => setEstado(e.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors',
                estado === e.key ? 'bg-brand/10 text-brand' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {e.label} <span className="tabular-nums opacity-70">{conteo[e.key]}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-0 basis-full sm:max-w-xs sm:flex-1 sm:basis-auto">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Colaborador, folio o título" className="h-9 pl-8" />
        </div>
        <Button variant="outline" size="sm" className="ml-auto" asChild>
          <Link to={RUTA.rendicionesCuentas}>
            <Settings2 className="mr-1 h-4 w-4" /> Tabla de cuentas{!rendiciones_aprobar && ' (solo lectura)'}
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">Folio</th>
                <th className="px-3 py-2 text-left font-semibold">Colaborador</th>
                <th className="px-3 py-2 text-left font-semibold">Título</th>
                <th className="px-3 py-2 text-left font-semibold">Aprobada en Rindegastos</th>
                <th className="px-3 py-2 text-right font-semibold">Gastos</th>
                <th className="px-3 py-2 text-right font-semibold">A contabilizar</th>
                <th className="px-3 py-2 text-right font-semibold">Fuera del asiento</th>
                <th className="px-3 py-2 text-left font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((i) => {
                const r = resumen.get(i.id)
                const falta = [r?.sinCuenta ? `${r.sinCuenta} sin cuenta` : null, r?.sinCeco ? `${r.sinCeco} sin CECO` : null].filter(Boolean)
                return (
                  <tr
                    key={i.id}
                    onClick={() => navigate(RUTA.rendicion(i.id))}
                    className="cursor-pointer border-b last:border-0 hover:bg-accent/50"
                  >
                    <td className="px-3 py-2 font-medium tabular-nums">
                      <Link to={RUTA.rendicion(i.id)} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {i.folio ?? i.id}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{i.empleado_nombre}</td>
                    <td className="max-w-[260px] truncate px-3 py-2 text-muted-foreground" title={i.titulo ?? ''}>{i.titulo}</td>
                    <td className="px-3 py-2 tabular-nums">{formatFecha(i.fecha_cierre)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r?.gastos ?? 0}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{pesos(r?.contabilizar ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r?.excluido ? pesos(r.excluido) : '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <EstadoBadge estado={i.estado} />
                        {i.cambio_rg && <span className="text-xs font-medium text-destructive">Cambió en Rindegastos</span>}
                        {i.estado !== 'aprobado' && falta.length > 0 && (
                          <span className="text-xs text-muted-foreground">{falta.join(' · ')}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    {informes.length === 0
                      ? 'Aún no hay rendiciones de Rindegastos. Aparecen aquí cuando la sincronización tenga el token de la API.'
                      : 'No hay rendiciones en este estado.'}
                  </td>
                </tr>
              )}
            </tbody>
            {visibles.length > 1 && (
              <tfoot>
                <tr className="border-t bg-accent font-semibold">
                  <td colSpan={5} className="px-3 py-2">{visibles.length} rendiciones</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pesos(totalVisible)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>

      {estadoSync && (
        <p className="text-xs text-muted-foreground">
          Fuente: API de Rindegastos (informes cerrados y no integrados). Actualizado el {formatFechaHora(estadoSync.sincronizado_en)}.
        </p>
      )}
    </div>
  )
}
