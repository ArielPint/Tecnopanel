import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Eye, MessageSquareWarning, Package, Paperclip, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Input } from '@/modules/financiero/components/ui/input'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { formatFecha, formatFechaHora } from '@/modules/financiero/utils/formatters'
import { cn } from '@/lib/utils'
import { Aviso, Cargando } from '../components/Estados'
import { EstadoBadge, SelectorCodigo, textoPeriodo, type Opcion } from '../components/rendiciones'
import { useCatalogos } from '../hooks/useDatosFin'
import { usePermisosFin } from '../hooks/usePermisosFin'
import { pesos } from '../lib/formato'
import { RUTA } from '../lib/rutas'
import {
  cambiarEstado,
  cargarAsiento,
  cargarAsientoFinal,
  cargarCatalogosSap,
  cargarInforme,
  cargarPeriodos,
  congelada,
  guardarGasto,
  nombreCuenta,
  nombreSocio,
  type Archivo,
  type CambioGasto,
  type CatalogosSap,
  type Gasto,
  type Historial,
  type Informe,
  type LineaAsiento,
  type LineaFinal,
  type TipoLinea,
} from '../lib/rendiciones'

// Detalle de una rendición: sus gastos (con las correcciones de contabilidad), el asiento (propuesto mientras se
// revisa; congelado desde que se aprueba) y las acciones aprobar / observar / reabrir. Después muestra su lote y
// el asiento de SAP. La base valida todo de nuevo (rg_guardar_gasto, rg_cambiar_estado).

const ACCIONES: Record<string, string> = {
  aprobado: 'Aprobada',
  observado: 'Observada',
  reabierto: 'Reabierta',
  gasto: 'Corrección',
  exportado: 'En lote para SAP',
  lote_anulado: 'Lote anulado',
  integrado: 'Encontrada en SAP',
  marcado_rg: 'Marcada en Rindegastos',
  cambio_rg: 'Cambio en Rindegastos',
}

const hoy = () => new Date().toLocaleDateString('sv-SE')

interface FilaAsiento {
  tipo: TipoLinea
  cuenta: string | null
  socio: string | null
  ceco: string | null
  proyecto: string | null
  glosa: string | null
  debe: number
  haber: number
}

function Respaldos({ archivos }: { archivos: Archivo[] }) {
  if (!archivos?.length) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex flex-wrap gap-1">
      {archivos.map((a, i) => (
        <a
          key={i}
          href={a.grande ?? a.original ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
          title={a.nombre ?? 'Respaldo'}
        >
          <Paperclip className="h-3 w-3" />
          {archivos.length > 1 ? i + 1 : 'Ver'}
        </a>
      ))}
    </span>
  )
}

export default function Rendicion() {
  const id = Number(useParams().id)
  const { rendiciones_aprobar } = usePermisosFin()
  const { catalogos } = useCatalogos()
  const [informe, setInforme] = useState<Informe | null>(null)
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [historial, setHistorial] = useState<Historial[]>([])
  const [problemas, setProblemas] = useState<string[]>([])
  const [lineas, setLineas] = useState<LineaAsiento[]>([])
  const [finales, setFinales] = useState<LineaFinal[]>([])
  const [sap, setSap] = useState<CatalogosSap | null>(null)
  const [periodos, setPeriodos] = useState<Record<string, string>>({})
  const [error, setError] = useState<Error | null>(null)
  const [cargado, setCargado] = useState(false)
  const [fecha, setFecha] = useState('')
  const [observando, setObservando] = useState(false)
  const [observacion, setObservacion] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const recargar = useCallback(async () => {
    const [d, l, f] = await Promise.all([cargarInforme(id), cargarAsiento(id), cargarAsientoFinal([id])])
    setInforme(d.informe)
    setGastos(d.gastos)
    setHistorial(d.historial)
    setProblemas(d.problemas)
    setLineas(l)
    setFinales(f)
  }, [id])

  useEffect(() => {
    let cancelado = false
    Promise.all([recargar(), cargarCatalogosSap(), cargarPeriodos()])
      .then(([, s, p]) => {
        if (cancelado) return
        setSap(s)
        setPeriodos(p)
      })
      .catch((e) => !cancelado && setError(e))
      .finally(() => !cancelado && setCargado(true))
    return () => {
      cancelado = true
    }
  }, [recargar])

  // fecha contable sugerida: la de aprobación en Rindegastos si su período está abierto; si no, hoy
  useEffect(() => {
    if (!cargado || !informe || fecha) return
    const cierre = informe.fecha_cierre
    setFecha(informe.fecha_asiento ?? (cierre && periodos[cierre.slice(0, 7)] === 'N' ? cierre : hoy()))
  }, [cargado, informe, periodos, fecha])

  const cuentas = useMemo(() => new Map((sap?.cuentas ?? []).map((c) => [c.codigo, c])), [sap])
  const socios = useMemo(() => new Map((sap?.socios ?? []).map((s) => [s.codigo, s])), [sap])
  const opcCuentas = useMemo<Opcion[]>(
    () => (sap?.cuentas ?? []).filter((c) => c.activa).map((c) => ({ valor: c.codigo, etiqueta: `${c.codigo_formato ?? c.codigo} · ${c.nombre}` })),
    [sap],
  )
  const opcProyectos = useMemo<Opcion[]>(
    () => (sap?.proyectos ?? []).filter((p) => p.activo).map((p) => ({ valor: p.codigo, etiqueta: `${p.codigo} · ${p.nombre}` })),
    [sap],
  )
  const opcSocios = useMemo<Opcion[]>(
    () => (sap?.socios ?? []).filter((s) => s.activo).map((s) => ({ valor: s.codigo, etiqueta: `${s.codigo} · ${s.nombre}` })),
    [sap],
  )
  const opcCecos = useMemo<Opcion[]>(
    () => (catalogos?.cecos ?? []).filter((c) => c.activo).map((c) => ({ valor: c.codigo, etiqueta: `${c.codigo} · ${c.nombre}` })),
    [catalogos],
  )
  const porGasto = useMemo(() => new Map(lineas.filter((l) => l.gasto_id !== null).map((l) => [l.gasto_id!, l])), [lineas])

  if (error) return <Aviso error={error} />
  if (!cargado) return <Cargando />
  if (!informe) {
    return (
      <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
        Esta rendición no existe o ya no está en la bandeja. <Link to={RUTA.rendiciones} className="text-primary hover:underline">Volver</Link>
      </div>
    )
  }

  const fija = congelada(informe.estado)
  const editable = rendiciones_aprobar && !fija
  const excluidas = lineas.filter((l) => l.motivo_exclusion)
  // desde aprobada se muestra el asiento congelado (lo que va al archivo), no la propuesta en vivo
  const asiento: FilaAsiento[] = fija ? finales : lineas.filter((l) => !l.motivo_exclusion)
  const debe = asiento.reduce((s, l) => s + l.debe, 0)
  const haber = asiento.reduce((s, l) => s + l.haber, 0)
  const avisoPeriodo = fecha ? textoPeriodo(periodos[fecha.slice(0, 7)]) : null

  async function corregir(gasto: number, cambio: CambioGasto) {
    try {
      await guardarGasto(gasto, cambio)
      await recargar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function accion(estado: 'aprobado' | 'observado' | 'pendiente') {
    setOcupado(true)
    try {
      await cambiarEstado(id, estado, { fecha: estado === 'aprobado' ? fecha : undefined, observacion: estado === 'observado' ? observacion : undefined })
      await recargar()
      setObservando(false)
      setObservacion('')
      toast.success(estado === 'aprobado' ? 'Rendición aprobada.' : estado === 'observado' ? 'Observación guardada.' : 'Rendición reabierta.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  const textoCuenta = (l: FilaAsiento) => (l.socio ? nombreSocio(socios, l.socio) : nombreCuenta(cuentas, l.cuenta))

  return (
    <div className="space-y-4">
      <Link to={RUTA.rendiciones} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Rendiciones
      </Link>

      {/* cabecera */}
      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">Rendición {informe.folio ?? informe.id}</h2>
              <EstadoBadge estado={informe.estado} />
            </div>
            <p className="text-sm text-muted-foreground">{informe.titulo}</p>
            <p className="mt-2 text-sm">
              <span className="font-medium">{informe.empleado_nombre}</span>
              {informe.empleado_rut && <span className="text-muted-foreground"> · {informe.empleado_rut}</span>}
              {informe.empleado_email && <span className="text-muted-foreground"> · {informe.empleado_email}</span>}
            </p>
            {informe.nota && <p className="mt-1 text-xs text-muted-foreground">Nota: {informe.nota}</p>}
          </div>
          <dl className="space-y-1 text-sm">
            <div><dt className="inline text-muted-foreground">Enviada: </dt><dd className="inline">{formatFecha(informe.fecha_envio)}</dd></div>
            <div><dt className="inline text-muted-foreground">Aprobada en Rindegastos: </dt><dd className="inline">{formatFecha(informe.fecha_cierre)}</dd></div>
            {informe.aprobador && <div><dt className="inline text-muted-foreground">Aprobador: </dt><dd className="inline">{informe.aprobador}</dd></div>}
            {(informe.politica || informe.fondo) && (
              <div><dt className="inline text-muted-foreground">Política: </dt><dd className="inline">{[informe.politica, informe.fondo].filter(Boolean).join(' · ')}</dd></div>
            )}
          </dl>
          <dl className="space-y-1 text-sm">
            <div><dt className="inline text-muted-foreground">Total aprobado: </dt><dd className="inline font-semibold tabular-nums">{pesos(informe.total_aprobado)}</dd></div>
            <div><dt className="inline text-muted-foreground">A contabilizar: </dt><dd className="inline font-semibold tabular-nums">{pesos(haber)}</dd></div>
            {informe.empleado_ceco && <div><dt className="inline text-muted-foreground">CECO del colaborador: </dt><dd className="inline">{informe.empleado_ceco}</dd></div>}
            {informe.archivos?.length > 0 && <div className="flex gap-1"><dt className="text-muted-foreground">Archivos:</dt><dd><Respaldos archivos={informe.archivos} /></dd></div>}
          </dl>
          {Object.keys(informe.campos ?? {}).length > 0 && (
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              {Object.entries(informe.campos).map(([k, v]) => `${k}: ${v ?? '—'}`).join(' · ')}
            </p>
          )}
        </CardContent>
      </Card>

      {informe.cambio_rg && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>
            Rindegastos cambió esta rendición después de aprobada (ver historial). El asiento sigue con los datos de la aprobación
            {informe.estado === 'aprobado' ? ': reábrela para tomar los nuevos.' : '.'}
          </span>
        </div>
      )}
      {informe.estado === 'observado' && informe.observacion && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span><span className="font-semibold">Observación:</span> {informe.observacion}</span>
        </div>
      )}
      {informe.estado === 'exportado' && (
        <div className="flex items-start gap-2 rounded-md border bg-card p-3 text-sm">
          <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>
            En el <Link to={RUTA.rendicionesLotes} className="font-semibold text-primary hover:underline">lote {informe.lote_id}</Link>, esperando
            que contabilidad lo importe en SAP. Cuando su asiento aparezca en SAP pasa a «En SAP».
          </span>
        </div>
      )}
      {informe.estado === 'integrado' && (
        <div className="flex items-start gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <span>
            En SAP: asiento <span className="font-semibold">N° {informe.sap_numero}</span>
            {informe.integrado_en && <span className="text-muted-foreground"> (encontrado el {formatFechaHora(informe.integrado_en)})</span>}.{' '}
            {informe.rg_marcado_en
              ? 'Marcada como integrada en Rindegastos.'
              : informe.rg_marca_error
                ? `No se pudo marcar en Rindegastos (se reintenta cada hora): ${informe.rg_marca_error}`
                : 'Se marcará como integrada en Rindegastos en la próxima sincronización.'}
          </span>
        </div>
      )}

      {/* gastos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Gastos</CardTitle>
          <p className="text-xs text-muted-foreground">
            {editable
              ? 'Cuenta, CECO y proyecto vienen de la tabla de cuentas y los campos de Rindegastos; una factura va al proveedor. Si cambias uno, queda fijo para ese gasto; déjalo vacío para volver a la regla.'
              : 'Cuenta, CECO, proyecto o proveedor según la tabla de cuentas, los campos de Rindegastos y las correcciones de contabilidad.'}
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1000px] border-collapse text-sm">
            <thead>
              <tr className="border-y bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">Va</th>
                <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                <th className="px-3 py-2 text-left font-semibold">Gasto</th>
                <th className="px-3 py-2 text-left font-semibold">Documento</th>
                <th className="px-3 py-2 text-right font-semibold">Total</th>
                <th className="w-56 px-3 py-2 text-left font-semibold">Cuenta</th>
                <th className="w-40 px-3 py-2 text-left font-semibold">CECO</th>
                <th className="w-44 px-3 py-2 text-left font-semibold">Proyecto</th>
                <th className="px-3 py-2 text-left font-semibold">Respaldo</th>
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => {
                const l = porGasto.get(g.id)
                const fuera = !!l?.motivo_exclusion
                const rechazado = g.estado_rg !== 1
                const factura = l?.tipo === 'proveedor'
                const campos = editable && !rechazado
                return (
                  <tr key={g.id} className={cn('border-b align-top last:border-0', fuera && 'text-muted-foreground')}>
                    <td className="px-3 py-2">
                      <Checkbox
                        aria-label="Incluir en el asiento"
                        checked={!fuera}
                        disabled={!editable || rechazado}
                        onCheckedChange={(v) => corregir(g.id, { incluir: v === true })}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatFecha(g.fecha)}</td>
                    <td className="px-3 py-2">
                      <span className={cn('font-medium', fuera ? '' : 'text-foreground')}>{g.categoria || 'Sin categoría'}</span>
                      {g.proveedor && <span className="block text-xs">{g.proveedor}</span>}
                      {g.nota && <span className="block text-xs text-muted-foreground">{g.nota}</span>}
                      {fuera && <span className="block text-xs font-medium text-warning">{l?.motivo_exclusion}</span>}
                      {editable && g.incluir !== null && !rechazado && (
                        <button className="block text-xs text-primary hover:underline" onClick={() => corregir(g.id, { incluir: null })}>
                          Volver a la regla
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {g.tipo_documento ?? '—'}
                      {g.numero_documento && <span className="block">N° {g.numero_documento}</span>}
                      {g.rut_proveedor && <span className="block text-muted-foreground">RUT {g.rut_proveedor}</span>}
                      {g.iva > 0 && <span className="block text-muted-foreground">IVA {pesos(g.iva)}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                      {pesos(g.total)}
                      {g.moneda !== 'CLP' && <span className="block text-xs text-destructive">{g.moneda}</span>}
                    </td>
                    {factura && !fuera ? (
                      <td colSpan={3} className="px-3 py-2">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Factura: al debe del proveedor (socio de negocio)
                        </span>
                        {campos ? (
                          <SelectorCodigo
                            opciones={opcSocios}
                            valor={g.socio ?? l?.socio ?? null}
                            onCambio={(v) => corregir(g.id, { socio: v })}
                            placeholder="Proveedor (RUT o nombre)"
                            ariaLabel="Proveedor"
                            className={cn('max-w-md', !g.socio && 'border-dashed')}
                          />
                        ) : (
                          <span className="text-xs">{nombreSocio(socios, l?.socio ?? null) ?? 'Sin proveedor'}</span>
                        )}
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2">
                          {campos ? (
                            <SelectorCodigo
                              opciones={opcCuentas}
                              valor={g.cuenta ?? l?.cuenta ?? null}
                              onCambio={(v) => corregir(g.id, { cuenta: v })}
                              placeholder="Sin cuenta"
                              ariaLabel="Cuenta"
                              className={cn(!g.cuenta && 'border-dashed')}
                            />
                          ) : (
                            <span className="text-xs">{nombreCuenta(cuentas, l?.cuenta ?? null) ?? '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {campos ? (
                            <SelectorCodigo
                              opciones={opcCecos}
                              valor={g.ceco ?? l?.ceco ?? null}
                              onCambio={(v) => corregir(g.id, { ceco: v })}
                              placeholder="Sin CECO"
                              ariaLabel="CECO"
                              className={cn(!g.ceco && 'border-dashed')}
                            />
                          ) : (
                            <span className="text-xs">{l?.ceco ?? '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {campos ? (
                            <SelectorCodigo
                              opciones={opcProyectos}
                              valor={g.proyecto ?? l?.proyecto ?? null}
                              onCambio={(v) => corregir(g.id, { proyecto: v })}
                              placeholder="Sin proyecto"
                              ariaLabel="Proyecto"
                              className={cn(!g.proyecto && 'border-dashed')}
                            />
                          ) : (
                            <span className="text-xs">{l?.proyecto ?? '—'}</span>
                          )}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2"><Respaldos archivos={g.archivos} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {editable && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">
              Borde punteado: el valor sale de la regla. Borde continuo: lo fijó contabilidad para este gasto.
            </p>
          )}
        </CardContent>
      </Card>

      {/* asiento */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{fija ? 'Asiento aprobado' : 'Asiento propuesto'}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {fija
              ? 'Congelado al aprobar: es lo que va al archivo de SAP, aunque después cambie la tabla de cuentas.'
              : 'Un asiento por rendición: una línea al debe por gasto y la contrapartida al haber.'}
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-y bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">Cuenta / socio de negocio</th>
                <th className="px-3 py-2 text-left font-semibold">CECO</th>
                <th className="px-3 py-2 text-left font-semibold">Proyecto</th>
                <th className="px-3 py-2 text-left font-semibold">Glosa</th>
                <th className="px-3 py-2 text-right font-semibold">Debe</th>
                <th className="px-3 py-2 text-right font-semibold">Haber</th>
              </tr>
            </thead>
            <tbody>
              {asiento.map((l, i) => {
                const texto = textoCuenta(l)
                return (
                  <tr key={i} className="border-b last:border-0">
                    <td className={cn('px-3 py-2', !texto && 'font-medium text-destructive')}>
                      {texto ?? (l.tipo === 'gasto' ? 'Falta la cuenta' : 'Falta el socio de negocio')}
                      {l.socio && <span className="block text-xs text-muted-foreground">{nombreCuenta(cuentas, l.cuenta) ?? 'sin cuenta asociada'}</span>}
                    </td>
                    <td className={cn('px-3 py-2', l.tipo === 'gasto' && !l.ceco && 'font-medium text-destructive')}>
                      {l.ceco ?? (l.tipo === 'gasto' ? 'Falta' : '')}
                    </td>
                    <td className="px-3 py-2">{l.proyecto}</td>
                    <td className="max-w-[280px] truncate px-3 py-2 text-muted-foreground" title={l.glosa ?? ''}>{l.glosa}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.debe ? pesos(l.debe) : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.haber ? pesos(l.haber) : ''}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-accent font-semibold">
                <td colSpan={4} className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{pesos(debe)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pesos(haber)}</td>
              </tr>
            </tfoot>
          </table>
          {!fija && excluidas.length > 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Fuera del asiento: {excluidas.length} {excluidas.length === 1 ? 'gasto' : 'gastos'} por {pesos(excluidas.reduce((s, l) => s + l.debe, 0))}.
            </p>
          )}
        </CardContent>
      </Card>

      {/* acciones */}
      {rendiciones_aprobar && !['exportado', 'integrado'].includes(informe.estado) && (
        <Card>
          <CardContent className="space-y-3 p-4">
            {informe.estado !== 'aprobado' ? (
              <>
                {problemas.length > 0 && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                    <p className="font-semibold">Para aprobar falta:</p>
                    <ul className="ml-5 list-disc">
                      {problemas.map((p) => <li key={p}>{p}</li>)}
                    </ul>
                  </div>
                )}
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Fecha contable</span>
                    <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9 w-40" />
                  </label>
                  <Button disabled={ocupado || problemas.length > 0 || !fecha || !!avisoPeriodo} onClick={() => accion('aprobado')}>
                    <Check className="mr-1 h-4 w-4" /> Aprobar asiento
                  </Button>
                  <Button variant="outline" disabled={ocupado} onClick={() => setObservando((v) => !v)}>
                    <MessageSquareWarning className="mr-1 h-4 w-4" /> Observar
                  </Button>
                </div>
                {avisoPeriodo && <p className="text-xs text-destructive">El período de esa fecha está {avisoPeriodo}: elige otra fecha.</p>}
                {observando && (
                  <div className="space-y-2">
                    <Textarea
                      value={observacion}
                      onChange={(e) => setObservacion(e.target.value)}
                      placeholder="Qué falta o qué hay que corregir (queda en el historial)"
                      rows={3}
                    />
                    <Button size="sm" disabled={ocupado || !observacion.trim()} onClick={() => accion('observado')}>
                      Guardar observación
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm">
                  Aprobada con fecha contable <span className="font-semibold">{formatFecha(informe.fecha_asiento)}</span>
                  {informe.aprobado_en && <span className="text-muted-foreground"> · {formatFechaHora(informe.aprobado_en)}</span>}. Queda lista para
                  el próximo lote (Rendiciones › Aprobadas).
                </p>
                <Button variant="outline" size="sm" disabled={ocupado} onClick={() => accion('pendiente')}>
                  <RotateCcw className="mr-1 h-4 w-4" /> Reabrir
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {!rendiciones_aprobar && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Eye className="h-3.5 w-3.5" /> Solo lectura: aprobar requiere el permiso «Aprobar rendiciones».
        </p>
      )}

      {/* historial */}
      {historial.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Historial</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {historial.map((h) => (
              <p key={h.id}>
                <span className="tabular-nums text-muted-foreground">{formatFechaHora(h.en)}</span> ·{' '}
                <span className="font-medium">{ACCIONES[h.accion] ?? h.accion}</span>
                {h.usuario_nombre && <span> por {h.usuario_nombre}</span>}
                {h.detalle && <span className="text-muted-foreground"> — {h.detalle}</span>}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
