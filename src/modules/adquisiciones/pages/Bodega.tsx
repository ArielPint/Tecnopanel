import { useEffect, useMemo, useState } from 'react'
import { Check, Download, History, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { cargarXLSX } from '@/lib/cargarLibrerias'
import { cn } from '@/lib/utils'
import {
  BODEGAS,
  guardarConteo,
  listarBodega,
  listarHistorialBodega,
  revertirConteo,
  type EstadoConteo,
  type FilaBodega,
  type MovimientoBodega,
} from '../lib/api'
import { usePermisosAdq } from '../hooks/usePermisosAdq'

// Bodega: stock físico contado, stock inutilizable y comprometido a distribuir por artículo, en B006
// (Santiago) y B007 (Puerto Varas). No va a SAP y la sincronización no lo pisa. Si hay conteo, ese
// stock reemplaza al de SAP: disponible real = max(stock usado − inutilizable, 0) − comprometido de
// bodega. El pendiente de OC lo calcula SAP y no se edita. Cada cambio queda en el historial y se
// corrige con un movimiento nuevo, nunca borrando.

type Filtro = 'todos' | 'contados' | 'sin_conteo' | 'revisar' | 'diferencia' | 'pendiente_oc'
type Edicion = { fisico: string; inutilizable: string; comprometido: string; observacion: string }

const num = (n: number | null | undefined, dec = 2) =>
  n == null ? '—' : new Intl.NumberFormat('es-CL', { maximumFractionDigits: dec }).format(n)
const fecha = (s: string | null) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString('es-CL') : '—')
const fechaHora = (s: string) => new Date(s).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
const clave = (f: { articulo_codigo: string; bodega_codigo: string }) => `${f.bodega_codigo}|${f.articulo_codigo}`
const texto = (n: number | null) => (n == null ? '' : String(n))
const leer = (s: string) => (s.trim() === '' ? null : Number(s))

const ESTADO: Record<EstadoConteo, { label: string; clase: string }> = {
  sin_conteo: { label: 'Sin conteo', clase: 'border-border text-muted-foreground' },
  vigente: { label: 'Vigente', clase: 'border-success/40 bg-success/10 text-success' },
  atencion: { label: 'Atención', clase: 'border-warning/40 bg-warning/10 text-warning' },
  desactualizado: { label: 'Desactualizado', clase: 'border-destructive/40 bg-destructive/10 text-destructive' },
}

const original = (f: FilaBodega): Edicion => ({
  fisico: texto(f.stock_fisico),
  inutilizable: f.inutilizable ? String(f.inutilizable) : '',
  comprometido: texto(f.comprometido_bodega),
  observacion: f.observacion ?? '',
})

export default function Bodega() {
  const [filas, setFilas] = useState<FilaBodega[]>([])
  const [loading, setLoading] = useState(true)
  const { sucursales } = usePermisosAdq()
  const bodegas = (['B006', 'B007'] as const).filter((b) => sucursales.reposicion.includes(b === 'B006' ? 'Santiago' : 'Puerto Varas'))
  const [bodega, setBodega] = useState<'B006' | 'B007'>('B006')
  useEffect(() => {
    if (bodegas.length && !bodegas.includes(bodega)) setBodega(bodegas[0])
  }, [bodegas.join(), bodega]) // eslint-disable-line react-hooks/exhaustive-deps
  const [vista, setVista] = useState<'stock' | 'movimientos'>('stock')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [edit, setEdit] = useState<Record<string, Edicion>>({})
  // filas con stock físico que se confirman como contadas hoy sin cambiar el valor
  const [confirmadas, setConfirmadas] = useState<Set<string>>(new Set())
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [historialDe, setHistorialDe] = useState<FilaBodega | null>(null)

  async function cargar() {
    setLoading(true)
    try {
      setFilas(await listarBodega())
      setEdit({})
      setConfirmadas(new Set())
      setMotivo('')
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
  const cumple = (f: FilaBodega, x: Filtro) =>
    x === 'todos'
      ? true
      : x === 'contados'
        ? f.stock_fisico != null
        : x === 'sin_conteo'
          ? f.stock_fisico == null && (f.stock_sap !== 0 || f.pendiente_oc > 0)
          : x === 'revisar'
            ? f.estado_conteo === 'atencion' || f.estado_conteo === 'desactualizado'
            : x === 'diferencia'
              ? f.diferencia_sap != null && Math.abs(f.diferencia_sap) > 0.0001
              : f.pendiente_oc > 0
  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return deBodega
      .filter((f) => cumple(f, filtro))
      .filter((f) => !q || f.articulo_nombre.toLowerCase().includes(q) || f.articulo_codigo.toLowerCase().includes(q))
  }, [deBodega, filtro, busqueda]) // eslint-disable-line react-hooks/exhaustive-deps

  const valor = (f: FilaBodega) => edit[clave(f)] ?? original(f)
  const setCampo = (f: FilaBodega, campo: keyof Edicion, v: string) =>
    setEdit((e) => ({ ...e, [clave(f)]: { ...valor(f), [campo]: campo === 'observacion' ? v : v.replace(',', '.') } }))
  const cambiada = (f: FilaBodega) => {
    const e = edit[clave(f)]
    const o = original(f)
    const distinto =
      !!e &&
      (leer(e.fisico) !== leer(o.fisico) ||
        (leer(e.inutilizable) ?? 0) !== (leer(o.inutilizable) ?? 0) ||
        leer(e.comprometido) !== leer(o.comprometido) ||
        e.observacion.trim() !== o.observacion.trim())
    return distinto || confirmadas.has(clave(f))
  }
  const cambios = deBodega.filter(cambiada)

  // Disponible real con lo que se está editando
  function calculo(f: FilaBodega) {
    const e = valor(f)
    const usado = leer(e.fisico) ?? f.stock_sap
    const utilizable = Math.max(usado - (leer(e.inutilizable) ?? 0), 0)
    return { usado, disponible: utilizable - (leer(e.comprometido) ?? 0) }
  }

  function confirmar(f: FilaBodega) {
    setConfirmadas((s) => new Set(s).add(clave(f)))
  }

  async function guardar() {
    for (const f of cambios) {
      const e = valor(f)
      const [fis, inu, com] = [leer(e.fisico), leer(e.inutilizable), leer(e.comprometido)]
      if ([fis, inu, com].some((n) => n != null && !(n >= 0)))
        return toast.error(`Revisa las cantidades de ${f.articulo_nombre}: deben ser números mayores o iguales a 0`)
      if (fis != null && (inu ?? 0) > fis) return toast.error(`En ${f.articulo_nombre} el stock inutilizable supera el stock físico`)
    }
    setGuardando(true)
    try {
      await guardarConteo(
        cambios.map((f) => {
          const e = valor(f)
          return {
            articulo_codigo: f.articulo_codigo,
            bodega_codigo: f.bodega_codigo,
            stock_fisico: leer(e.fisico),
            inutilizable: leer(e.inutilizable),
            comprometido: leer(e.comprometido),
            observacion: e.observacion.trim() || null,
          }
        }),
        motivo,
      )
      toast.success(cambios.length === 1 ? 'Registro guardado' : `${cambios.length} registros guardados`)
      await cargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  async function exportar() {
    const XLSX = await cargarXLSX()
    const datos = lista.map((f) => ({
      Código: f.articulo_codigo,
      Artículo: f.articulo_nombre,
      Unidad: f.unidad ?? '',
      Grupo: f.grupo ?? '',
      'Stock SAP': f.stock_sap,
      'Comprometido SAP': f.comprometido_sap,
      'Pendiente OC': f.pendiente_oc,
      'Stock físico': f.stock_fisico ?? '',
      'Stock inutilizable': f.inutilizable,
      'Comprometido bodega': f.comprometido_bodega ?? '',
      'Stock usado': f.stock_usado,
      'Disponible real': f.disponible_real,
      'Diferencia vs SAP': f.diferencia_sap ?? '',
      'Estado conteo': ESTADO[f.estado_conteo].label,
      'Fecha conteo': f.contado_at ? fecha(f.contado_at) : '',
      'Registrado por': f.actualizado_por_nombre ?? '',
      Observación: f.observacion ?? '',
      'Consumo mensual (12 m)': f.consumo_mensual,
      'Última recepción': f.ultima_recepcion ? fecha(f.ultima_recepcion) : '',
    }))
    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(datos), bodega)
    XLSX.writeFile(libro, `Bodega_${bodega}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const FILTROS: [Filtro, string][] = [
    ['todos', 'Todos'],
    ['contados', 'Con conteo'],
    ['sin_conteo', 'Sin conteo'],
    ['revisar', 'Conteo por renovar'],
    ['diferencia', 'Diferencia con SAP'],
    ['pendiente_oc', 'Con OC por recibir'],
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Bodega</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">
          Registra el stock físico, el stock inutilizable y lo comprometido a distribuir. Cuando hay conteo, ese stock reemplaza al de SAP para calcular el disponible
          real: stock usado menos inutilizable, menos comprometido de bodega. El pendiente de OC viene de SAP. Un conteo está vigente hasta 3 días, pide atención
          de 4 a 7 y después queda desactualizado.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {bodegas.map((b) => (
          <button
            key={b}
            onClick={() => setBodega(b)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm font-semibold',
              bodega === b ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {BODEGAS[b]} <span className="font-mono-tabular text-xs opacity-70">{b}</span>
          </button>
        ))}
        <div className="ml-auto flex rounded-md border p-0.5">
          {(
            [
              ['stock', 'Stock'],
              ['movimientos', 'Movimientos'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setVista(k)}
              className={cn('rounded px-3 py-1 text-xs font-semibold', vista === k ? 'bg-brand/10 text-brand' : 'text-muted-foreground hover:text-foreground')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {vista === 'movimientos' ? (
        <Movimientos bodega={bodega} onCambio={cargar} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {FILTROS.map(([k, label]) => (
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
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar artículo o código" className="h-9 w-full sm:w-72" />
            <Button size="sm" variant="outline" onClick={exportar} disabled={lista.length === 0}>
              <Download className="mr-1 h-4 w-4" /> Excel
            </Button>
            {cambios.length > 0 && (
              <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <Input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Motivo (opcional), p. ej. conteo semanal"
                  className="h-9 w-full sm:w-64"
                  aria-label="Motivo del registro"
                />
                <Button size="sm" variant="outline" disabled={guardando} onClick={() => (setEdit({}), setConfirmadas(new Set()))}>
                  Descartar
                </Button>
                <Button size="sm" disabled={guardando} onClick={guardar}>
                  {guardando ? 'Guardando…' : `Guardar ${cambios.length} ${cambios.length === 1 ? 'registro' : 'registros'}`}
                </Button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="h-40 animate-pulse rounded bg-muted" />
          ) : lista.length === 0 ? (
            <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              {filtro === 'contados' ? 'Todavía no hay conteos en esta bodega.' : 'No hay artículos con estos filtros.'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border bg-card">
              <table className="w-full min-w-[1180px] text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Artículo</th>
                    <th className="px-2 py-2 text-right font-semibold">Stock SAP</th>
                    <th className="px-2 py-2 text-right font-semibold">Pendiente OC</th>
                    <th className="w-28 px-2 py-2 font-semibold">Stock físico</th>
                    <th className="w-28 px-2 py-2 font-semibold">Inutilizable</th>
                    <th className="w-28 px-2 py-2 font-semibold">Comprometido</th>
                    <th className="px-2 py-2 text-right font-semibold">Disponible real</th>
                    <th className="px-2 py-2 font-semibold">Conteo</th>
                    <th className="w-48 px-2 py-2 font-semibold">Observación</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lista.slice(0, 400).map((f) => {
                    const e = valor(f)
                    const c = calculo(f)
                    const editada = cambiada(f)
                    return (
                      <tr key={clave(f)} className={cn('border-b last:border-0', editada && 'bg-brand/5')}>
                        <td className="px-3 py-1.5">
                          <p className="max-w-[300px] truncate font-medium" title={f.articulo_nombre}>
                            {f.articulo_nombre}
                          </p>
                          <p className="font-mono-tabular text-[11px] text-muted-foreground">
                            {f.articulo_codigo} · {f.unidad ?? '—'}
                            {f.grupo && <span className="ml-1.5">· {f.grupo}</span>}
                          </p>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono-tabular" title={`Comprometido SAP: ${num(f.comprometido_sap)} (referencia, no se descuenta)`}>
                          {num(f.stock_sap)}
                          {f.diferencia_sap != null && Math.abs(f.diferencia_sap) > 0.0001 && (
                            <p className={cn('text-[11px]', f.diferencia_sap < 0 ? 'text-destructive' : 'text-success')}>
                              {f.diferencia_sap > 0 ? '+' : ''}
                              {num(f.diferencia_sap)} físico
                            </p>
                          )}
                        </td>
                        <td
                          className="px-2 py-1.5 text-right font-mono-tabular"
                          title={f.oc_abiertas ? `${f.oc_abiertas} OC abiertas · próxima entrega ${fecha(f.proxima_entrega)}` : undefined}
                        >
                          {f.pendiente_oc > 0 ? num(f.pendiente_oc) : <span className="text-muted-foreground">—</span>}
                          {f.oc_atrasada && <p className="text-[11px] font-semibold text-destructive">OC atrasada</p>}
                        </td>
                        {(['fisico', 'inutilizable', 'comprometido'] as const).map((campo) => (
                          <td key={campo} className="px-2 py-1.5">
                            <Input
                              inputMode="decimal"
                              value={e[campo]}
                              onChange={(ev) => setCampo(f, campo, ev.target.value)}
                              placeholder={campo === 'fisico' ? 'SAP' : '0'}
                              className={cn('h-8 text-right font-mono-tabular', editada && 'border-brand')}
                              aria-label={`${campo === 'fisico' ? 'Stock físico' : campo === 'inutilizable' ? 'Stock inutilizable' : 'Comprometido a distribuir'} de ${f.articulo_nombre}`}
                            />
                          </td>
                        ))}
                        <td className={cn('px-2 py-1.5 text-right font-mono-tabular font-semibold', c.disponible < 0 && 'text-destructive')}>
                          {num(c.disponible)}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className={ESTADO[f.estado_conteo].clase}>
                              {ESTADO[f.estado_conteo].label}
                            </Badge>
                            {f.stock_fisico != null && f.estado_conteo !== 'vigente' && !confirmadas.has(clave(f)) && (
                              <button
                                onClick={() => confirmar(f)}
                                title="Confirmar el mismo stock físico como contado hoy"
                                aria-label={`Confirmar conteo de ${f.articulo_nombre}`}
                                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          {f.contado_at && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {fecha(f.contado_at)}
                              {f.actualizado_por_nombre && ` · ${f.actualizado_por_nombre}`}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={e.observacion}
                            onChange={(ev) => setCampo(f, 'observacion', ev.target.value)}
                            placeholder="—"
                            className={cn('h-8', editada && 'border-brand')}
                            aria-label={`Observación de ${f.articulo_nombre}`}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          {(f.updated_at || f.contado_at) && (
                            <button
                              onClick={() => setHistorialDe(f)}
                              title="Ver historial"
                              aria-label={`Historial de ${f.articulo_nombre}`}
                              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <History className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {lista.length > 400 && <p className="p-3 text-center text-xs text-muted-foreground">Se muestran 400 de {lista.length}. Usa el buscador.</p>}
            </div>
          )}
        </>
      )}

      <Dialog open={!!historialDe} onOpenChange={(o) => !o && setHistorialDe(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Historial · {historialDe?.articulo_nombre}</DialogTitle>
            <DialogDescription>
              {historialDe?.articulo_codigo} en {historialDe && BODEGAS[historialDe.bodega_codigo]}
            </DialogDescription>
          </DialogHeader>
          {historialDe && <Movimientos bodega={historialDe.bodega_codigo} articulo={historialDe.articulo_codigo} onCambio={cargar} compacto />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------- movimientos

function Movimientos({ bodega, articulo, onCambio, compacto }: { bodega: string; articulo?: string; onCambio: () => void; compacto?: boolean }) {
  const [movs, setMovs] = useState<MovimientoBodega[]>([])
  const [loading, setLoading] = useState(true)
  const [revertir, setRevertir] = useState<MovimientoBodega | null>(null)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function cargar() {
    setLoading(true)
    try {
      setMovs(await listarHistorialBodega(bodega, articulo))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar el historial')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [bodega, articulo]) // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmarReversa() {
    if (!revertir) return
    if (!motivo.trim()) return toast.error('Indica el motivo de la corrección')
    setEnviando(true)
    try {
      await revertirConteo(revertir.id, motivo)
      toast.success('Valores anteriores restaurados')
      setRevertir(null)
      setMotivo('')
      await cargar()
      onCambio()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo revertir')
    } finally {
      setEnviando(false)
    }
  }

  const par = (antes: number | null, despues: number | null) =>
    antes === despues ? (
      <span className="text-muted-foreground">{num(despues)}</span>
    ) : (
      <span>
        <span className="text-muted-foreground line-through">{num(antes)}</span> → <span className="font-semibold">{num(despues)}</span>
      </span>
    )

  if (loading) return <div className="h-32 animate-pulse rounded bg-muted" />
  if (movs.length === 0)
    return <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">Todavía no hay movimientos registrados.</p>

  return (
    <>
      <div className={cn('overflow-x-auto rounded-md border bg-card', compacto && 'max-h-[60vh] overflow-y-auto')}>
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Fecha</th>
              {!articulo && <th className="px-2 py-2 font-semibold">Artículo</th>}
              <th className="px-2 py-2 font-semibold">Stock físico</th>
              <th className="px-2 py-2 font-semibold">Inutilizable</th>
              <th className="px-2 py-2 font-semibold">Comprometido</th>
              <th className="px-2 py-2 text-right font-semibold">SAP</th>
              <th className="px-2 py-2 font-semibold">Quién y por qué</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {movs.map((m) => (
              <tr key={m.id} className={cn('border-b align-top last:border-0', m.revertido && 'opacity-60')}>
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                  {fechaHora(m.created_at)}
                  {m.accion === 'reversa' && (
                    <Badge variant="outline" className="ml-1.5">
                      Corrección
                    </Badge>
                  )}
                </td>
                {!articulo && (
                  <td className="px-2 py-1.5">
                    <p className="max-w-[240px] truncate" title={m.articulo_nombre}>
                      {m.articulo_nombre}
                    </p>
                    <p className="font-mono-tabular text-[11px] text-muted-foreground">{m.articulo_codigo}</p>
                  </td>
                )}
                <td className="px-2 py-1.5 font-mono-tabular">{par(m.stock_fisico_antes, m.stock_fisico)}</td>
                <td className="px-2 py-1.5 font-mono-tabular">{par(m.inutilizable_antes ?? 0, m.inutilizable ?? 0)}</td>
                <td className="px-2 py-1.5 font-mono-tabular">{par(m.comprometido_antes, m.comprometido)}</td>
                <td className="px-2 py-1.5 text-right font-mono-tabular text-muted-foreground">{num(m.stock_sap)}</td>
                <td className="px-2 py-1.5">
                  <p>{m.usuario_nombre ?? '—'}</p>
                  {(m.motivo || m.observacion) && (
                    <p className="max-w-[260px] text-[12px] text-muted-foreground">{[m.motivo, m.observacion].filter(Boolean).join(' · ')}</p>
                  )}
                  {m.revertido && <p className="text-[11px] text-muted-foreground">Revertido</p>}
                </td>
                <td className="px-2 py-1.5">
                  {!m.revertido && (
                    <button
                      onClick={() => setRevertir(m)}
                      title="Volver a los valores anteriores"
                      aria-label="Revertir movimiento"
                      className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!revertir} onOpenChange={(o) => !o && (setRevertir(null), setMotivo(''))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restaurar valores anteriores</DialogTitle>
            <DialogDescription>
              {revertir?.articulo_nombre} vuelve a stock físico {num(revertir?.stock_fisico_antes)}, inutilizable {num(revertir?.inutilizable_antes ?? 0)} y
              comprometido {num(revertir?.comprometido_antes)}. Queda registrado como una corrección; el historial no se borra.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo de la corrección" aria-label="Motivo de la corrección" />
          <DialogFooter>
            <Button variant="outline" onClick={() => (setRevertir(null), setMotivo(''))}>
              Cancelar
            </Button>
            <Button disabled={enviando || !motivo.trim()} onClick={confirmarReversa}>
              {enviando ? 'Restaurando…' : 'Restaurar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
