import { useEffect, useMemo, useState } from 'react'
import { Copy, Save, Scale, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { formatFechaHora } from '@/modules/financiero/utils/formatters'
import { pesos } from '../lib/formato'
import { SUCURSALES } from '@/lib/lineasNegocio'
import { cn } from '@/lib/utils'
import { Aviso, Cargando } from '../components/Estados'
import { olvidarEerr, useCatalogos, useEerr } from '../hooks/useDatosFin'
import { usePermisosFin } from '../hooks/usePermisosFin'
import { useProrrateo } from '../hooks/useProrrateo'
import { guardarProrrateo } from '../lib/api'
import { LINEAS } from '../lib/catalogos'

// % fijos por CECO de línea y año para repartir TODO el resultado de la administración (CECO 9xxx de
// las dos sucursales). La base valida que sumen 100 (fin_guardar_prorrateo).

const redondear = (v: number) => Math.round(v * 100) / 100
const NUM = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })

export default function Prorrateo() {
  const permisos = usePermisosFin()
  const { catalogos, estado, error: errorCat } = useCatalogos()
  const { filas: prorrateo, loading, error, recargar } = useProrrateo()
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [valores, setValores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const puedeEditar = permisos.configurar

  // Resultado del año sin prorrateo: monto de la administración y referencia de ingresos por CECO.
  // Solo si el usuario ve el estado de resultados (si no, se omite la estimación).
  const { filas: eerr } = useEerr(permisos.veEerr ? `${anio}-01` : null, permisos.veEerr ? `${anio}-12` : null, false)

  const anios = useMemo(() => {
    const ultimo = estado?.ultimo_periodo ? Number(estado.ultimo_periodo.slice(0, 4)) : new Date().getFullYear()
    const primero = estado?.primer_periodo ? Number(estado.primer_periodo.slice(0, 4)) : ultimo
    const lista: number[] = []
    for (let a = ultimo + 1; a >= primero; a--) lista.push(a)
    return lista
  }, [estado])

  const cecosLinea = useMemo(() => (catalogos?.cecos ?? []).filter((c) => c.tipo === 'linea'), [catalogos])
  const delAnio = useMemo(() => prorrateo.filter((p) => p.anio === anio), [prorrateo, anio])

  // al cambiar de año (o al recargar), el formulario toma lo guardado
  useEffect(() => {
    setValores(Object.fromEntries(delAnio.map((p) => [p.ceco, String(p.porcentaje)])))
  }, [delAnio])

  const tipo = useMemo(() => new Map((catalogos?.cecos ?? []).map((c) => [c.codigo, c.tipo])), [catalogos])
  const grupo = useMemo(() => new Map((catalogos?.cuentas ?? []).map((c) => [c.codigo, c.grupo])), [catalogos])
  const administracion = useMemo(() => eerr.filter((r) => tipo.get(r.ceco) === 'administracion').reduce((s, r) => s + r.monto, 0), [eerr, tipo])
  const ingresosPorCeco = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of eerr) if (grupo.get(r.cuenta) === 4 && tipo.get(r.ceco) === 'linea') m.set(r.ceco, (m.get(r.ceco) ?? 0) + r.monto)
    return m
  }, [eerr, grupo, tipo])

  const num = (c: string) => Number((valores[c] ?? '').replace(',', '.')) || 0
  const suma = Math.round(cecosLinea.reduce((s, c) => s + num(c.codigo), 0) * 10000) / 10000
  const sumaOk = Math.abs(suma - 100) <= 0.005
  const cambiado =
    cecosLinea.some((c) => num(c.codigo) !== (delAnio.find((p) => p.ceco === c.codigo)?.porcentaje ?? 0))
  const actualizado = delAnio.reduce<string | null>((m, p) => (!m || p.actualizado_en > m ? p.actualizado_en : m), null)

  function copiarAnterior() {
    const previo = prorrateo.filter((p) => p.anio === anio - 1)
    if (previo.length === 0) return toast.info(`${anio - 1} no tiene % cargados.`)
    setValores(Object.fromEntries(previo.map((p) => [p.ceco, String(p.porcentaje)])))
  }

  function segunIngresos() {
    const total = [...ingresosPorCeco.values()].filter((v) => v > 0).reduce((s, v) => s + v, 0)
    if (total <= 0) return toast.info(`${anio} no tiene ingresos por línea para usar de referencia.`)
    const nuevos = Object.fromEntries(cecosLinea.map((c) => [c.codigo, redondear(Math.max(ingresosPorCeco.get(c.codigo) ?? 0, 0) / total * 100)]))
    // el redondeo puede dejar la suma en 99,9999: la diferencia va al CECO más grande
    const diferencia = redondear(100 - Object.values(nuevos).reduce((s, v) => s + v, 0))
    const mayor = Object.entries(nuevos).sort((a, b) => b[1] - a[1])[0][0]
    nuevos[mayor] = redondear(nuevos[mayor] + diferencia)
    setValores(Object.fromEntries(Object.entries(nuevos).map(([k, v]) => [k, v ? String(v) : ''])))
  }

  async function guardar(filas: { ceco: string; porcentaje: number }[]) {
    setGuardando(true)
    try {
      await guardarProrrateo(anio, filas)
      olvidarEerr()
      await recargar()
      toast.success(filas.length ? `Prorrateo de ${anio} guardado.` : `${anio} quedó sin prorrateo.`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  const fallo = errorCat ?? error
  if (fallo) return <Aviso error={fallo} />
  if (!catalogos || loading) return <Cargando />

  return (
    <div className="max-w-4xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Define qué % de la administración (todos los CECO 9xxx, de las dos sucursales: gastos, costos y otros ingresos) recibe cada CECO de
        línea. Los % son por año y deben sumar 100. Un año sin % muestra la administración aparte.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Año</span>
          <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
            <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anios.map((a) => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {puedeEditar && (
          <>
            <Button variant="outline" size="sm" onClick={copiarAnterior}>
              <Copy className="mr-1 h-4 w-4" /> Copiar {anio - 1}
            </Button>
            {permisos.veEerr && (
              <Button variant="outline" size="sm" onClick={segunIngresos}>
                <Scale className="mr-1 h-4 w-4" /> Según ingresos de {anio}
              </Button>
            )}
          </>
        )}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">Línea</th>
                {SUCURSALES.map((s) => (
                  <th key={s} className="px-3 py-2 text-right font-semibold">{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LINEAS.filter((l) => l !== 'Administración').map((linea) => (
                <tr key={linea} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{linea}</td>
                  {SUCURSALES.map((s) => {
                    const ceco = cecosLinea.find((c) => c.linea === linea && c.sucursal === s)
                    if (!ceco) return <td key={s} />
                    const estimado = (administracion * num(ceco.codigo)) / 100
                    return (
                      <td key={s} className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-[11px] text-muted-foreground" title={ceco.nombre}>{ceco.codigo}</span>
                          <Input
                            inputMode="decimal"
                            className="h-8 w-24 text-right tabular-nums"
                            value={valores[ceco.codigo] ?? ''}
                            placeholder="0"
                            disabled={!puedeEditar}
                            onChange={(e) => setValores((v) => ({ ...v, [ceco.codigo]: e.target.value }))}
                            aria-label={`% de ${linea} en ${s}`}
                          />
                          <span className="text-muted-foreground">%</span>
                        </div>
                        {permisos.veEerr && estimado !== 0 && (
                          <span className="text-[11px] tabular-nums text-muted-foreground">{NUM.format(estimado)}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-accent font-semibold">
                <td className="px-3 py-2">Suma</td>
                <td colSpan={2} className={cn('px-3 py-2 text-right tabular-nums', sumaOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
                  {suma.toLocaleString('es-CL', { maximumFractionDigits: 2 })}% {sumaOk ? '✓' : '(debe ser 100%)'}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {permisos.veEerr && (
        <p className="text-xs text-muted-foreground">
          Resultado de la administración en {anio} (lo que se reparte): {pesos(administracion)}. Bajo cada % va el monto que recibiría ese CECO.
        </p>
      )}
      {actualizado && <p className="text-xs text-muted-foreground">Última modificación: {formatFechaHora(actualizado)}.</p>}

      {puedeEditar && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={guardando || !sumaOk || !cambiado}
            onClick={() => guardar(cecosLinea.filter((c) => num(c.codigo) > 0).map((c) => ({ ceco: c.codigo, porcentaje: num(c.codigo) })))}
          >
            <Save className="mr-1 h-4 w-4" /> {guardando ? 'Guardando…' : `Guardar ${anio}`}
          </Button>
          {delAnio.length > 0 && (
            <Button variant="outline" disabled={guardando} onClick={() => guardar([])}>
              <Trash2 className="mr-1 h-4 w-4" /> Dejar {anio} sin prorrateo
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
