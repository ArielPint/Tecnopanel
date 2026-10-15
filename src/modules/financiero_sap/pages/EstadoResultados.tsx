import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'
import { cn } from '@/lib/utils'
import BarraFiltros, { useFiltros } from '../components/Filtros'
import DetalleAsientos, { type PedidoDetalle } from '../components/DetalleAsientos'
import { Aviso, Cargando, PieFuente } from '../components/Estados'
import { useCatalogos, useEerr } from '../hooks/useDatosFin'
import { usePermisosFin } from '../hooks/usePermisosFin'
import { useProrrateo } from '../hooks/useProrrateo'
import {
  armarInforme,
  cecoPasa,
  etiquetaColumna,
  etiquetaMes,
  filtrar,
  lineaDe,
  sucursalDe,
  type Columnas,
  type FilaInforme,
} from '../lib/eerr'
import { RUTA } from '../lib/rutas'

const NUM = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })
const fmt = (v: number | undefined) => (v === undefined || Math.round(v) === 0 ? '–' : NUM.format(v))
const fmtPct = (v: number, base: number) => (base ? `${((v / base) * 100).toFixed(1)}%` : '')

const OPCIONES_COLUMNAS: { key: Columnas; label: string }[] = [
  { key: 'mes', label: 'Por mes' },
  { key: 'linea', label: 'Por línea' },
  { key: 'sucursal', label: 'Por sucursal' },
]

export default function EstadoResultados() {
  const permisos = usePermisosFin()
  const { catalogos, estado, error: errorCat } = useCatalogos()
  const { periodo, filtros, desde, hasta } = useFiltros()
  const { filas, loading, error } = useEerr(desde, hasta, periodo.prorratear)
  const { aniosConProrrateo } = useProrrateo()
  const [columnas, setColumnas] = useState<Columnas>('mes')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [pedido, setPedido] = useState<PedidoDetalle | null>(null)

  const cecos = useMemo(() => new Map((catalogos?.cecos ?? []).map((c) => [c.codigo, c])), [catalogos])
  const informe = useMemo(
    () => (catalogos ? armarInforme(filtrar(filas, cecos, filtros), catalogos, columnas) : null),
    [catalogos, filas, cecos, filtros, columnas],
  )

  // Los grupos se abren solos la primera vez; el resto, a pedido.
  useEffect(() => {
    if (informe && abiertos.size === 0) setAbiertos(new Set(informe.filas.filter((f) => f.tipo === 'grupo').map((f) => f.id)))
  }, [informe, abiertos.size])

  const padres = useMemo(() => new Map((informe?.filas ?? []).map((f) => [f.id, f.padreId])), [informe])
  const visible = (f: FilaInforme) => {
    for (let p = f.padreId; p; p = padres.get(p) ?? null) if (!abiertos.has(p)) return false
    return true
  }
  const alternar = (id: string) =>
    setAbiertos((a) => {
      const n = new Set(a)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const sinProrrateo = periodo.prorratear && !aniosConProrrateo.has(periodo.anio)

  function abrirDetalle(f: FilaInforme, col: string | null) {
    if (!catalogos || f.cuentas.length === 0) return
    const conReparto = periodo.prorratear && !sinProrrateo
    // CECO que forman la cifra: los que pasan los filtros y la columna. Con prorrateo, la administración
    // ya está repartida en las líneas y sus asientos no son parte de la cifra.
    const lista = ['', ...catalogos.cecos.map((c) => c.codigo)].filter((codigo) => {
      const c = cecos.get(codigo)
      if (!cecoPasa(codigo, c, filtros)) return false
      if (conReparto && c?.tipo === 'administracion') return false
      if (col !== null && columnas === 'linea' && lineaDe(c) !== col) return false
      if (col !== null && columnas === 'sucursal' && sucursalDe(c) !== col) return false
      return true
    })
    const mes = col !== null && columnas === 'mes' ? col : null
    const valores = f.valores
    const monto = col === null ? valores.total : (valores.col[col] ?? 0)
    // la parte prorrateada solo se conoce en total; por columna se recalcula con las filas
    const prorrateado =
      col === null
        ? valores.prorrateado
        : filtrar(filas, cecos, filtros)
            .filter((r) => r.prorrateado && f.cuentas.includes(r.cuenta))
            .filter((r) =>
              columnas === 'mes'
                ? r.periodo.slice(0, 7) === col
                : columnas === 'linea'
                  ? lineaDe(cecos.get(r.ceco)) === col
                  : sucursalDe(cecos.get(r.ceco)) === col,
            )
            .reduce((s, r) => s + r.monto, 0)
    setPedido({
      titulo: `${f.codigo ? `${f.codigo} · ` : ''}${f.nombre}`,
      subtitulo: [
        mes ? etiquetaMes(mes) : `${etiquetaMes(desde)} a ${etiquetaMes(hasta)}`,
        col !== null && columnas !== 'mes' ? col : null,
        filtros.sucursal,
        filtros.linea,
        filtros.ceco ? `CECO ${filtros.ceco}` : null,
        filtros.dim2 !== null ? `Tarea WIP ${filtros.dim2 || '(sin)'}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      filtro: { desde: mes ?? desde, hasta: mes ?? hasta, cuentas: f.cuentas, cecos: lista, dim2: filtros.dim2 },
      monto,
      prorrateado,
    })
  }

  async function exportar() {
    if (!informe) return
    try {
      await exportarExcel(
        `estado-resultados-${desde}-a-${hasta}`,
        informe.filas.map((f) => ({
          Código: f.codigo ?? '',
          Cuenta: `${'   '.repeat(f.profundidad)}${f.nombre}`,
          ...Object.fromEntries(informe.columnas.map((c) => [etiquetaColumna(c, columnas), Math.round(f.valores.col[c] ?? 0)])),
          Total: Math.round(f.valores.total),
          '% de ingresos': informe.ingresos.total ? Number(((f.valores.total / informe.ingresos.total) * 100).toFixed(1)) : null,
        })),
      )
    } catch (e) {
      toast.error(`No se pudo exportar: ${(e as Error).message}`)
    }
  }

  const fallo = errorCat ?? error
  if (fallo) return <Aviso error={fallo} />

  return (
    <div className="space-y-4">
      <BarraFiltros catalogos={catalogos} estado={estado} sucursales={permisos.eerr} />

      {sinProrrateo && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {periodo.anio} no tiene % de prorrateo cargados: la administración (CECO 9xxx) se muestra aparte, en su propia línea.
          {permisos.configurar && (
            <>
              {' '}
              <Link to={RUTA.prorrateo} className="font-semibold underline">Cargar los % de {periodo.anio}</Link>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={columnas} onValueChange={(v) => setColumnas(v as Columnas)}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {OPCIONES_COLUMNAS.map((o) => (
                <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAbiertos(new Set((informe?.filas ?? []).filter((f) => f.tieneHijos).map((f) => f.id)))}
          >
            <ChevronsUpDown className="mr-1 h-4 w-4" /> Expandir todo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAbiertos(new Set((informe?.filas ?? []).filter((f) => f.tipo === 'grupo').map((f) => f.id)))}
          >
            <ChevronsDownUp className="mr-1 h-4 w-4" /> Contraer
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={exportar} disabled={!informe}>
          <Download className="mr-1 h-4 w-4" /> Exportar a Excel
        </Button>
      </div>

      {!informe || loading ? (
        <Cargando />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="sticky left-0 z-10 min-w-[180px] bg-muted px-3 sm:min-w-[280px] py-2 text-left font-semibold">Cuenta</th>
                {informe.columnas.map((c) => (
                  <th key={c} className="whitespace-nowrap px-3 py-2 text-right font-semibold">{etiquetaColumna(c, columnas)}</th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Total</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">% ingresos</th>
              </tr>
            </thead>
            <tbody>
              {informe.filas.filter(visible).map((f) => {
                const resaltada = f.tipo === 'grupo' || f.tipo === 'subtotal' || f.tipo === 'total'
                const clic = f.cuentas.length > 0
                const celda = 'whitespace-nowrap px-3 py-1.5 text-right tabular-nums'
                return (
                  <tr
                    key={f.id}
                    className={cn(
                      'border-b last:border-0',
                      // fondos sólidos: la primera columna es fija y no debe transparentar lo que pasa por debajo
                      f.tipo === 'grupo' && 'bg-muted font-semibold',
                      f.tipo === 'subtotal' && 'bg-accent font-bold',
                      f.tipo === 'total' && 'bg-accent font-extrabold',
                    )}
                  >
                    <td
                      className={cn('sticky left-0 z-10 px-3 py-1.5', resaltada ? 'bg-inherit' : 'bg-card')}
                      style={{ paddingLeft: 12 + f.profundidad * 16 }}
                    >
                      <div className="flex items-center gap-1">
                        {f.tieneHijos ? (
                          <button onClick={() => alternar(f.id)} className="text-muted-foreground hover:text-foreground" aria-label="Abrir o cerrar">
                            {abiertos.has(f.id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        ) : (
                          <span className="w-3.5" />
                        )}
                        {f.codigo && <span className="mr-1 text-[11px] text-muted-foreground">{f.codigo}</span>}
                        <span className={cn('whitespace-nowrap', resaltada && 'uppercase tracking-wide', f.tipo === 'cuenta' && 'font-normal')}>{f.nombre}</span>
                      </div>
                    </td>
                    {informe.columnas.map((c) => (
                      <td key={c} className={celda}>
                        {clic && f.valores.col[c] ? (
                          <button className="hover:text-brand hover:underline" onClick={() => abrirDetalle(f, c)}>
                            {fmt(f.valores.col[c])}
                          </button>
                        ) : (
                          fmt(f.valores.col[c])
                        )}
                      </td>
                    ))}
                    <td className={cn(celda, 'font-semibold')}>
                      {clic && f.valores.total ? (
                        <button className="hover:text-brand hover:underline" onClick={() => abrirDetalle(f, null)}>
                          {fmt(f.valores.total)}
                        </button>
                      ) : (
                        fmt(f.valores.total)
                      )}
                    </td>
                    <td className={cn(celda, 'text-muted-foreground')}>{fmtPct(f.valores.total, informe.ingresos.total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <PieFuente estado={estado} extra="Montos en pesos: haber − debe (ingresos en positivo, costos y gastos en negativo). Haz clic en una cifra para ver sus asientos." />

      {catalogos && <DetalleAsientos pedido={pedido} catalogos={catalogos} onClose={() => setPedido(null)} />}
    </div>
  )
}
