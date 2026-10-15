import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import MontoInput from '@/components/MontoInput'
import { cn } from '@/lib/utils'
import { hoyChile } from '@/modules/sso/lib/estados'
import { usePermisosAdq } from '../hooks/usePermisosAdq'
import { fmtPesos, guardarPresupuestos, listarCentrosCosto, listarPresupuestos, type CentroCosto, type FilaPresupuesto } from '../lib/api'

/** Presupuesto anual neto por centro de costo. Solo el jefe de compras; SAP no tiene presupuestos. */
export default function Presupuestos() {
  const anioActual = Number(hoyChile().slice(0, 4))
  const [anio, setAnio] = useState(anioActual)
  // Cada jefe de compras, los CECO de su sucursal (y los sin sucursal)
  const { sucursales } = usePermisosAdq()
  const [todos, setCentros] = useState<CentroCosto[]>([])
  const centros = useMemo(() => todos.filter((c) => !c.sucursal || sucursales.jefe.includes(c.sucursal)), [todos, sucursales.jefe])
  const [filas, setFilas] = useState<FilaPresupuesto[]>([])
  const [anteriores, setAnteriores] = useState<FilaPresupuesto[]>([])
  const [montos, setMontos] = useState<Record<string, number | null>>({})
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    setLoading(true)
    try {
      const [c, f, a] = await Promise.all([listarCentrosCosto(), listarPresupuestos(anio), listarPresupuestos(anio - 1)])
      setCentros(c)
      setFilas(f)
      setAnteriores(a)
      setMontos(Object.fromEntries(c.map((x) => [x.codigo, f.find((y) => y.centro_costo === x.codigo)?.presupuesto ?? null])))
      // los de otras sucursales no se tocan: no van en cambiados (centros ya viene filtrado)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [anio]) // eslint-disable-line react-hooks/exhaustive-deps

  const inicial = (codigo: string) => filas.find((y) => y.centro_costo === codigo)?.presupuesto ?? null
  const cambiados = centros.filter((c) => (montos[c.codigo] ?? null) !== inicial(c.codigo))
  const total = Object.values(montos).reduce<number>((a, m) => a + (m ?? 0), 0)

  const grupos = useMemo(
    () =>
      ['Santiago', 'Puerto Varas', null].map((suc) => ({
        sucursal: suc ?? 'Sin sucursal',
        centros: centros.filter((c) => c.sucursal === suc),
      })),
    [centros],
  )

  function copiarAnterior() {
    // ejecutado del año anterior como punto de partida, solo donde no hay monto
    setMontos((m) => {
      const n = { ...m }
      for (const c of centros) {
        if (n[c.codigo] != null) continue
        const a = anteriores.find((x) => x.centro_costo === c.codigo)
        const base = a?.presupuesto ?? (a ? Math.round(a.ejecutado) : null)
        if (base) n[c.codigo] = base
      }
      return n
    })
  }

  async function guardar() {
    setGuardando(true)
    try {
      await guardarPresupuestos(cambiados.map((c) => ({ centro_costo: c.codigo, anio, monto: montos[c.codigo] ?? null })))
      toast.success('Presupuestos guardados')
      await cargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Presupuesto por centro de costo</h1>
        <p className="text-sm text-muted-foreground">
          Monto anual neto (CLP) de compras de cada centro de costo de SAP. Se compara con lo ejecutado en OC de SAP y lo comprometido en el portal; al enviar o
          aprobar una solicitud se avisa si lo excede. Un monto vacío quita el presupuesto.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Año">
          {[anioActual + 1, anioActual, anioActual - 1].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" onClick={copiarAnterior} disabled={loading}>
          Completar vacíos con {anio - 1}
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">
          Total {anio}: <span className="font-mono-tabular font-semibold text-foreground">{fmtPesos(total)}</span>
        </span>
      </div>

      {loading ? (
        <div className="h-60 animate-pulse rounded bg-muted" />
      ) : centros.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Todavía no hay centros de costo de SAP en esta base. Llegan con la sincronización del servidor.
        </p>
      ) : (
        grupos
          .filter((g) => g.centros.length)
          .map((g) => (
            <Card key={g.sucursal}>
              <CardContent className="pt-3">
                <h2 className="mb-1 text-sm font-bold">{g.sucursal}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-2 font-semibold">Centro de costo</th>
                        <th className="w-48 px-2 py-2 font-semibold">Presupuesto {anio}</th>
                        <th className="px-2 py-2 text-right font-semibold">Ejecutado SAP</th>
                        <th className="px-2 py-2 text-right font-semibold">Comprometido</th>
                        <th className="py-2 pl-2 text-right font-semibold">% uso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.centros.map((c) => {
                        const f = filas.find((x) => x.centro_costo === c.codigo)
                        const uso = (f?.ejecutado ?? 0) + (f?.comprometido ?? 0)
                        const m = montos[c.codigo]
                        const pct = m ? Math.round((100 * uso) / m) : null
                        return (
                          <tr key={c.codigo} className="border-b last:border-0">
                            <td className="py-1.5 pr-2">
                              <span className="font-mono-tabular">{c.codigo}</span>
                              <span className="block text-xs text-muted-foreground">
                                {c.nombre}
                                {c.linea && ` · ${c.linea}`}
                              </span>
                            </td>
                            <td className="px-2 py-1.5">
                              <MontoInput
                                value={m ?? null}
                                onChange={(v) => setMontos((x) => ({ ...x, [c.codigo]: v }))}
                                placeholder="Sin presupuesto"
                                className={cn(
                                  'h-8 w-full rounded-md border border-input bg-background px-2 text-right text-sm font-mono-tabular',
                                  (m ?? null) !== inicial(c.codigo) && 'border-brand',
                                )}
                                aria-label={`Presupuesto ${anio} de ${c.codigo}`}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono-tabular">{fmtPesos(f?.ejecutado ?? 0)}</td>
                            <td className="px-2 py-1.5 text-right font-mono-tabular">{fmtPesos(f?.comprometido ?? 0)}</td>
                            <td className={cn('py-1.5 pl-2 text-right tabular-nums', pct != null && pct > 100 && 'font-semibold text-destructive')}>
                              {pct == null ? '—' : `${pct}%`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))
      )}

      <div className="sticky bottom-4 flex justify-end">
        <Button disabled={!cambiados.length || guardando} onClick={guardar} className="shadow-lg">
          {guardando ? 'Guardando…' : cambiados.length ? `Guardar ${cambiados.length} cambios` : 'Sin cambios'}
        </Button>
      </div>
    </div>
  )
}
