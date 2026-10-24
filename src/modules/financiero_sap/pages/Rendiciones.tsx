import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, FileOutput, Package, Search, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
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
  cargarAsientoFinal,
  cargarConfig,
  cargarInformes,
  congelada,
  crearLote,
  ESTADOS,
  type EstadoRendicion,
  type EstadoSyncRg,
  type Informe,
  type LineaAsiento,
  type LineaFinal,
} from '../lib/rendiciones'

// Bandeja: rendiciones aprobadas en Rindegastos y aún no integradas, con lo que iría al asiento y lo que le falta.
// En «Aprobadas» se eligen las que van al archivo de importación de SAP (un lote).

interface Resumen {
  contabilizar: number
  excluido: number
  gastos: number
  sinCuenta: number
  sinCeco: number
}

const vacio = (): Resumen => ({ contabilizar: 0, excluido: 0, gastos: 0, sinCuenta: 0, sinCeco: 0 })

export default function Rendiciones() {
  const navigate = useNavigate()
  const { rendiciones_aprobar } = usePermisosFin()
  const [informes, setInformes] = useState<Informe[] | null>(null)
  const [lineas, setLineas] = useState<LineaAsiento[]>([])
  const [finales, setFinales] = useState<LineaFinal[]>([])
  const [estadoSync, setEstadoSync] = useState<EstadoSyncRg | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [estado, setEstado] = useState<EstadoRendicion>('pendiente')
  const [buscar, setBuscar] = useState('')
  const [elegidas, setElegidas] = useState<Set<number>>(new Set())
  const [generando, setGenerando] = useState(false)

  useEffect(() => {
    let cancelado = false
    Promise.all([cargarInformes(), cargarAsiento(), cargarAsientoFinal(), cargarConfig()])
      .then(([i, l, f, c]) => {
        if (cancelado) return
        setInformes(i)
        setLineas(l)
        setFinales(f)
        setEstadoSync(c.estado)
      })
      .catch((e) => !cancelado && setError(e))
    return () => {
      cancelado = true
    }
  }, [])

  // propuesta en vivo para las que se revisan; asiento congelado desde aprobada
  const resumen = useMemo(() => {
    const congeladas = new Set((informes ?? []).filter((i) => congelada(i.estado)).map((i) => i.id))
    const m = new Map<number, Resumen>()
    for (const l of lineas) {
      const r = m.get(l.informe_id) ?? vacio()
      if (l.lado === 'haber') r.contabilizar = l.haber
      else if (l.motivo_exclusion) r.excluido += l.debe
      else {
        r.gastos++
        if (l.tipo === 'gasto' && !l.cuenta) r.sinCuenta++
        if (l.tipo === 'gasto' && !l.ceco) r.sinCeco++
      }
      m.set(l.informe_id, r)
    }
    for (const id of congeladas) m.set(id, { ...(m.get(id) ?? vacio()), contabilizar: 0, gastos: 0, sinCuenta: 0, sinCeco: 0 })
    for (const f of finales) {
      const r = m.get(f.informe_id) ?? vacio()
      if (f.tipo === 'contrapartida') r.contabilizar += f.haber
      else r.gastos++
      m.set(f.informe_id, r)
    }
    return m
  }, [lineas, finales, informes])

  const conteo = useMemo(() => {
    const c: Record<EstadoRendicion, number> = { pendiente: 0, observado: 0, aprobado: 0, exportado: 0, integrado: 0 }
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
  const seleccionables = estado === 'aprobado' && rendiciones_aprobar ? visibles.filter((i) => !i.cambio_rg) : []
  const elegidasVisibles = seleccionables.filter((i) => elegidas.has(i.id))
  const columnas = seleccionables.length ? 9 : 8

  function alternar(id: number, si: boolean) {
    setElegidas((s) => {
      const n = new Set(s)
      if (si) n.add(id)
      else n.delete(id)
      return n
    })
  }

  async function generar() {
    setGenerando(true)
    try {
      const lote = await crearLote(elegidasVisibles.map((i) => i.id))
      toast.success(`Lote ${lote} generado: descarga sus archivos para importarlos en SAP.`)
      navigate(`${RUTA.rendicionesLotes}?nuevo=${lote}`)
    } catch (e) {
      toast.error((e as Error).message)
      setGenerando(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Rendiciones aprobadas en Rindegastos que aún no están en SAP. Revisa el asiento propuesto de cada una, corrige lo que haga falta y
        apruébala. Las aprobadas se juntan en un lote: un archivo que contabilidad importa en SAP.
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
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={RUTA.rendicionesLotes}>
              <Package className="mr-1 h-4 w-4" /> Lotes para SAP
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={RUTA.rendicionesCuentas}>
              <Settings2 className="mr-1 h-4 w-4" /> Tabla de cuentas{!rendiciones_aprobar && ' (solo lectura)'}
            </Link>
          </Button>
        </div>
      </div>

      {seleccionables.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card p-3 text-sm">
          <span>
            {elegidasVisibles.length
              ? `${elegidasVisibles.length} ${elegidasVisibles.length === 1 ? 'rendición elegida' : 'rendiciones elegidas'} por ${pesos(elegidasVisibles.reduce((s, i) => s + (resumen.get(i.id)?.contabilizar ?? 0), 0))}`
              : 'Elige las rendiciones aprobadas que van al archivo para SAP.'}
          </span>
          <Button size="sm" disabled={generando || elegidasVisibles.length === 0} onClick={generar} className="ml-auto">
            <FileOutput className="mr-1 h-4 w-4" /> {generando ? 'Generando…' : 'Generar archivo para SAP'}
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                {seleccionables.length > 0 && (
                  <th className="w-8 px-3 py-2">
                    <Checkbox
                      aria-label="Elegir todas"
                      checked={elegidasVisibles.length === seleccionables.length}
                      onCheckedChange={(v) => setElegidas(new Set(v === true ? seleccionables.map((i) => i.id) : []))}
                    />
                  </th>
                )}
                <th className="px-3 py-2 text-left font-semibold">Folio</th>
                <th className="px-3 py-2 text-left font-semibold">Colaborador</th>
                <th className="px-3 py-2 text-left font-semibold">Título</th>
                <th className="px-3 py-2 text-left font-semibold">{congelada(estado) ? 'Fecha contable' : 'Aprobada en Rindegastos'}</th>
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
                const elegible = seleccionables.includes(i)
                return (
                  <tr
                    key={i.id}
                    onClick={() => navigate(RUTA.rendicion(i.id))}
                    className="cursor-pointer border-b last:border-0 hover:bg-accent/50"
                  >
                    {seleccionables.length > 0 && (
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        {elegible && (
                          <Checkbox aria-label={`Elegir ${i.folio ?? i.id}`} checked={elegidas.has(i.id)} onCheckedChange={(v) => alternar(i.id, v === true)} />
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 font-medium tabular-nums">
                      <Link to={RUTA.rendicion(i.id)} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {i.folio ?? i.id}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{i.empleado_nombre}</td>
                    <td className="max-w-[260px] truncate px-3 py-2 text-muted-foreground" title={i.titulo ?? ''}>{i.titulo}</td>
                    <td className="px-3 py-2 tabular-nums">{formatFecha(congelada(i.estado) ? i.fecha_asiento : i.fecha_cierre)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r?.gastos ?? 0}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{pesos(r?.contabilizar ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r?.excluido ? pesos(r.excluido) : '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <EstadoBadge estado={i.estado} />
                        {i.cambio_rg && <span className="text-xs font-medium text-destructive">Cambió en Rindegastos</span>}
                        {!congelada(i.estado) && falta.length > 0 && <span className="text-xs text-muted-foreground">{falta.join(' · ')}</span>}
                        {i.estado === 'exportado' && i.lote_id && <span className="text-xs text-muted-foreground">Lote {i.lote_id}</span>}
                        {i.estado === 'integrado' && i.sap_numero && <span className="text-xs text-muted-foreground">Asiento N° {i.sap_numero}</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={columnas} className="px-3 py-10 text-center text-sm text-muted-foreground">
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
                  <td colSpan={columnas - 3} className="px-3 py-2">{visibles.length} rendiciones</td>
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
          Fuente: API de Rindegastos (informes cerrados y no integrados) y SAP. Actualizado el {formatFechaHora(estadoSync.sincronizado_en)}.
        </p>
      )}
    </div>
  )
}
