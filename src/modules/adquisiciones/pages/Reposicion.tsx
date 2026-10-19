import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { cn } from '@/lib/utils'
import { BODEGAS, guardarReposicion, listarReposicion, type FilaReposicion } from '../lib/api'
import { RUTA } from '../lib/rutas'
import { usePermisosAdq } from '../hooks/usePermisosAdq'
import type { Prellenado } from './NuevaSolicitud'

// Reposición de stock de las bodegas B006 (Santiago) y B007 (Puerto Varas). SAP no tiene mínimos
// definidos: se cargan aquí. Disponible = stock − comprometido + pedido en OC + lo ya pedido en
// solicitudes abiertas del portal, para no pedir dos veces lo mismo.

type Filtro = 'bajo' | 'con_minimo' | 'sin_minimo' | 'todos'

const num = (n: number | null | undefined, dec = 0) =>
  n == null ? '—' : new Intl.NumberFormat('es-CL', { maximumFractionDigits: dec }).format(n)
const clave = (f: { articulo_codigo: string; bodega_codigo: string }) => `${f.bodega_codigo}|${f.articulo_codigo}`

export default function Reposicion() {
  const navigate = useNavigate()
  const [filas, setFilas] = useState<FilaReposicion[]>([])
  const [loading, setLoading] = useState(true)
  // Solo las bodegas de las sucursales donde es Compras o Bodega
  const { sucursales, comprasEn } = usePermisosAdq()
  const bodegas = (['B006', 'B007'] as const).filter((b) => sucursales.reposicion.includes(b === 'B006' ? 'Santiago' : 'Puerto Varas'))
  const [bodega, setBodega] = useState<'B006' | 'B007'>('B006')
  useEffect(() => {
    if (bodegas.length && !bodegas.includes(bodega)) setBodega(bodegas[0])
  }, [bodegas.join(), bodega]) // eslint-disable-line react-hooks/exhaustive-deps
  // Los mínimos los define Compras de la sucursal (adq_guardar_reposicion); Bodega solo los ve
  const puedeMinimos = comprasEn(bodega === 'B006' ? 'Santiago' : 'Puerto Varas')
  const [filtro, setFiltro] = useState<Filtro>('bajo')
  const [texto, setTexto] = useState('')
  // ediciones de mínimo / reorden aún sin guardar
  const [edit, setEdit] = useState<Record<string, { minimo: string; reorden: string }>>({})
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    setLoading(true)
    try {
      setFilas(await listarReposicion())
      setEdit({})
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  const deBodega = useMemo(() => filas.filter((f) => f.bodega_codigo === bodega), [filas, bodega])
  const cumple = (f: FilaReposicion, x: Filtro) =>
    x === 'todos' ? true : x === 'bajo' ? f.bajo_minimo : x === 'con_minimo' ? f.minimo != null : f.minimo == null && f.consumo_mensual > 0
  const lista = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return deBodega
      .filter((f) => cumple(f, filtro))
      .filter((f) => !q || f.articulo_nombre.toLowerCase().includes(q) || f.articulo_codigo.toLowerCase().includes(q))
      .sort((a, b) => b.consumo_mensual - a.consumo_mensual || a.articulo_nombre.localeCompare(b.articulo_nombre))
  }, [deBodega, filtro, texto]) // eslint-disable-line react-hooks/exhaustive-deps

  const valor = (f: FilaReposicion, campo: 'minimo' | 'reorden') => edit[clave(f)]?.[campo] ?? (f[campo] == null ? '' : String(f[campo]))
  const setValor = (f: FilaReposicion, campo: 'minimo' | 'reorden', v: string) =>
    setEdit((e) => ({ ...e, [clave(f)]: { minimo: valor(f, 'minimo'), reorden: valor(f, 'reorden'), [campo]: v } }))
  const cambios = filas.filter((f) => {
    const e = edit[clave(f)]
    return e && (e.minimo !== (f.minimo == null ? '' : String(f.minimo)) || e.reorden !== (f.reorden == null ? '' : String(f.reorden)))
  })

  function sugerirMinimos(meses: number) {
    // mínimo = consumo de N meses, para los visibles sin mínimo
    setEdit((e) => {
      const n = { ...e }
      for (const f of lista) {
        if (f.minimo != null || f.consumo_mensual <= 0 || n[clave(f)]?.minimo) continue
        n[clave(f)] = { minimo: String(Math.ceil(f.consumo_mensual * meses)), reorden: valor(f, 'reorden') }
      }
      return n
    })
  }

  async function guardar() {
    const malo = cambios.find((f) => {
      const e = edit[clave(f)]
      return (e.minimo && !(Number(e.minimo) >= 0)) || (e.reorden && !(Number(e.reorden) > 0))
    })
    if (malo) return toast.error(`Revisa el mínimo o la cantidad a pedir de ${malo.articulo_nombre}`)
    setGuardando(true)
    try {
      await guardarReposicion(
        cambios.map((f) => {
          const e = edit[clave(f)]
          return {
            articulo_codigo: f.articulo_codigo,
            bodega_codigo: f.bodega_codigo,
            minimo: e.minimo === '' ? null : Number(e.minimo),
            reorden: e.reorden === '' ? null : Number(e.reorden),
          }
        }),
      )
      toast.success('Mínimos guardados')
      await cargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  function crearSolicitud() {
    const sel = deBodega.filter((f) => elegidas.has(clave(f)) && f.bajo_minimo)
    if (sel.length === 0) return
    const estado: Prellenado = {
      datos: {
        sucursal: sel[0].sucursal,
        area: 'Bodega',
        titulo: `Reposición de stock ${BODEGAS[bodega]}`,
        lugar_entrega: BODEGAS[bodega],
        justificacion: `Artículos bajo el mínimo de stock en ${bodega}.`,
      },
      items: sel.map((f) => ({
        articulo_codigo: f.articulo_codigo,
        descripcion: f.articulo_nombre,
        cantidad: f.sugerido ?? 1,
        unidad: f.unidad || 'UN',
        precio_estimado: f.ultimo_precio != null ? Math.round(f.ultimo_precio) : null,
      })),
    }
    navigate(RUTA.nueva, { state: estado })
  }

  const elegidasBajo = deBodega.filter((f) => elegidas.has(clave(f)) && f.bajo_minimo).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Reposición de stock</h1>
        <p className="text-sm text-muted-foreground">
          Stock de SAP de las bodegas de Santiago y Puerto Varas contra los mínimos definidos aquí. El disponible descuenta lo comprometido y suma lo pedido en OC y en
          solicitudes abiertas del portal. El consumo es el promedio mensual de salidas de los últimos 12 meses.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {bodegas.map((b) => (
          <button
            key={b}
            onClick={() => {
              setBodega(b)
              setElegidas(new Set())
            }}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm font-semibold',
              bodega === b ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {BODEGAS[b]} <span className="font-mono-tabular text-xs opacity-70">{b}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['bajo', 'Bajo mínimo'],
            ['con_minimo', 'Con mínimo'],
            ['sin_minimo', 'Con consumo y sin mínimo'],
            ['todos', 'Todos'],
          ] as [Filtro, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFiltro(k)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              filtro === k ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {label} <span className="tabular-nums opacity-70">{deBodega.filter((f) => cumple(f, k)).length}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar artículo o código" className="h-9 w-full sm:w-72" />
        {filtro === 'sin_minimo' && puedeMinimos && (
          <>
            <Button size="sm" variant="outline" onClick={() => sugerirMinimos(1)}>
              Sugerir mínimo = 1 mes de consumo
            </Button>
            <Button size="sm" variant="outline" onClick={() => sugerirMinimos(2)}>
              = 2 meses
            </Button>
          </>
        )}
        <div className="ml-auto flex gap-2">
          {cambios.length > 0 && puedeMinimos && (
            <Button size="sm" variant="outline" disabled={guardando} onClick={guardar}>
              {guardando ? 'Guardando…' : `Guardar ${cambios.length} mínimos`}
            </Button>
          )}
          <Button size="sm" disabled={elegidasBajo === 0} onClick={crearSolicitud}>
            <ShoppingCart className="mr-1 h-4 w-4" /> Crear solicitud ({elegidasBajo})
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded bg-muted" />
      ) : lista.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {filtro === 'bajo'
            ? deBodega.some((f) => f.minimo != null)
              ? 'Ningún artículo está bajo su mínimo.'
              : puedeMinimos
                ? 'Todavía no hay mínimos definidos en esta bodega. Empieza por «Con consumo y sin mínimo».'
                : 'Todavía no hay mínimos definidos en esta bodega. Los define Compras.'
            : 'No hay artículos con estos filtros.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Elegir todos los bajo mínimo"
                    className="accent-[hsl(var(--brand))]"
                    checked={lista.some((f) => f.bajo_minimo) && lista.filter((f) => f.bajo_minimo).every((f) => elegidas.has(clave(f)))}
                    onChange={(e) => setElegidas(new Set(e.target.checked ? lista.filter((f) => f.bajo_minimo).map(clave) : []))}
                  />
                </th>
                <th className="px-2 py-2 font-semibold">Artículo</th>
                <th className="px-2 py-2 text-right font-semibold">Stock</th>
                <th className="px-2 py-2 text-right font-semibold">Comprom.</th>
                <th className="px-2 py-2 text-right font-semibold">Pedido</th>
                <th className="px-2 py-2 text-right font-semibold">Disponible</th>
                <th className="px-2 py-2 text-right font-semibold">Consumo/mes</th>
                <th className="px-2 py-2 text-right font-semibold">Cobertura</th>
                <th className="w-28 px-2 py-2 font-semibold">Mínimo</th>
                <th className="w-28 px-2 py-2 font-semibold">Pedir</th>
                <th className="px-2 py-2 text-right font-semibold">Sugerido</th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, 400).map((f) => (
                <tr key={clave(f)} className={cn('border-b last:border-0', f.bajo_minimo && 'bg-destructive/5')}>
                  <td className="px-3 py-1.5">
                    {f.bajo_minimo && (
                      <input
                        type="checkbox"
                        aria-label={`Elegir ${f.articulo_nombre}`}
                        className="accent-[hsl(var(--brand))]"
                        checked={elegidas.has(clave(f))}
                        onChange={(e) =>
                          setElegidas((s) => {
                            const n = new Set(s)
                            if (e.target.checked) n.add(clave(f))
                            else n.delete(clave(f))
                            return n
                          })
                        }
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <p className="max-w-[320px] truncate font-medium" title={f.articulo_nombre}>
                      {f.articulo_nombre}
                    </p>
                    <p className="font-mono-tabular text-[11px] text-muted-foreground">
                      {f.articulo_codigo} · {f.unidad ?? '—'}
                      {f.en_solicitud > 0 && <span className="ml-1.5 text-brand">en solicitud {num(f.en_solicitud, 2)}</span>}
                    </p>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono-tabular">{num(f.en_stock, 2)}</td>
                  <td className="px-2 py-1.5 text-right font-mono-tabular text-muted-foreground">{num(f.comprometido, 2)}</td>
                  <td className="px-2 py-1.5 text-right font-mono-tabular text-muted-foreground">{num(f.pedido, 2)}</td>
                  <td className={cn('px-2 py-1.5 text-right font-mono-tabular font-semibold', f.bajo_minimo && 'text-destructive')}>{num(f.disponible, 2)}</td>
                  <td className="px-2 py-1.5 text-right font-mono-tabular" title={`Máximo mensual en 12 meses: ${num(f.consumo_max_mes, 1)}`}>
                    {num(f.consumo_mensual, 1)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{f.cobertura_dias == null ? '—' : `${f.cobertura_dias} d`}</td>
                  <td className="px-2 py-1.5">
                    {!puedeMinimos ? (
                      <p className="text-right font-mono-tabular">{f.minimo == null ? '—' : num(f.minimo, 2)}</p>
                    ) : (
                    <Input
                      inputMode="decimal"
                      value={valor(f, 'minimo')}
                      onChange={(e) => setValor(f, 'minimo', e.target.value.replace(',', '.'))}
                      placeholder="—"
                      className={cn('h-8 text-right font-mono-tabular', edit[clave(f)] && 'border-brand')}
                      aria-label={`Mínimo de ${f.articulo_nombre}`}
                    />
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {!puedeMinimos ? (
                      <p className="text-right font-mono-tabular text-muted-foreground">{f.reorden == null ? 'auto' : num(f.reorden, 2)}</p>
                    ) : (
                    <Input
                      inputMode="decimal"
                      value={valor(f, 'reorden')}
                      onChange={(e) => setValor(f, 'reorden', e.target.value.replace(',', '.'))}
                      placeholder="auto"
                      title="Cantidad a pedir cuando baja del mínimo. Vacío: lo que falta para el mínimo más un mes de consumo."
                      className={cn('h-8 text-right font-mono-tabular', edit[clave(f)] && 'border-brand')}
                      aria-label={`Cantidad a pedir de ${f.articulo_nombre}`}
                    />
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {f.sugerido != null ? <Badge variant="destructive">{num(f.sugerido)}</Badge> : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length > 400 && <p className="p-3 text-center text-xs text-muted-foreground">Se muestran 400 de {lista.length}. Usa el buscador.</p>}
        </div>
      )}
    </div>
  )
}
