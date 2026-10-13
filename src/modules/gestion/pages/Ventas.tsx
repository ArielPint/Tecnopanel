import { useMemo, useState } from 'react'
import { AlertTriangle, Download } from 'lucide-react'
import { toast } from 'sonner'
import { useVentas, type FilaVenta } from '../hooks/useVentas'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'

type Agrupacion = 'proyecto' | 'linea' | 'sucursal' | 'mes' | 'anio'

const AGRUPACIONES: { key: Agrupacion; label: string }[] = [
  { key: 'proyecto', label: 'Por proyecto' },
  { key: 'linea', label: 'Por línea' },
  { key: 'sucursal', label: 'Por sucursal' },
  { key: 'mes', label: 'Por mes' },
  { key: 'anio', label: 'Por año' },
]

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const TODOS = 'todos'

function etiquetaMes(periodo: string): string {
  const [anio, mes] = periodo.split('-')
  return `${MESES[Number(mes) - 1]} ${anio}`
}

function formatUf(valor: number | null): string {
  if (valor == null) return '—'
  return `UF ${valor.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`
}

interface Grupo {
  clave: string
  /** Para ordenar cronológicamente las agrupaciones por mes y por año. */
  orden: string
  unidades: number
  facturas: number
  anticipos: number
  notasCredito: number
  montoPesos: number
  montoUf: number | null
  /** true si algún mes del grupo no tiene UF cargada: el total en UF queda incompleto. */
  ufIncompleta: boolean
}

// Un proyecto con dos líneas suma entero en cada una — decisión explícita del
// plan §8.0, por eso el total por línea puede superar el total de la empresa.
// (En SAP cada fila trae una sola línea, la de su centro de costo.)
function agrupar(filas: FilaVenta[], por: Agrupacion): Grupo[] {
  const mapa = new Map<string, Grupo>()
  const sumar = (clave: string, orden: string, f: FilaVenta) => {
    // montoUf arranca en null, no en 0: si ningún mes del grupo tiene UF cargada,
    // el total tiene que leerse como "sin UF", nunca como una venta de UF 0.
    const g = mapa.get(clave) ?? {
      clave, orden, unidades: 0, facturas: 0, anticipos: 0, notasCredito: 0,
      montoPesos: 0, montoUf: null as number | null, ufIncompleta: false,
    }
    g.unidades += f.unidades ?? 0
    if (f.tipo === 'factura') g.facturas += f.montoPesos
    else if (f.tipo === 'anticipo') g.anticipos += f.montoPesos
    else if (f.tipo === 'nota_credito') g.notasCredito += f.montoPesos
    g.montoPesos += f.montoPesos
    if (f.montoUf == null) g.ufIncompleta = true
    else g.montoUf = (g.montoUf ?? 0) + f.montoUf
    mapa.set(clave, g)
  }
  for (const f of filas) {
    if (por === 'linea') {
      if (f.lineas.length === 0) sumar('Sin línea', '', f)
      else f.lineas.forEach((l) => sumar(l, '', f))
    } else if (por === 'sucursal') sumar(f.sucursal ?? 'Sin sucursal', '', f)
    else if (por === 'mes') sumar(etiquetaMes(f.periodo), f.periodo.slice(0, 7), f)
    else if (por === 'anio') sumar(f.periodo.slice(0, 4), f.periodo.slice(0, 4), f)
    else sumar(f.proyecto, '', f)
  }
  const grupos = [...mapa.values()]
  if (por === 'mes' || por === 'anio') return grupos.sort((a, b) => a.orden.localeCompare(b.orden))
  return grupos.sort((a, b) => b.montoPesos - a.montoPesos)
}

function Filtro({
  valor, onChange, todos, opciones, ancho = 'w-40',
}: {
  valor: string
  onChange: (v: string) => void
  todos: string
  opciones: { value: string; label: string }[]
  ancho?: string
}) {
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger className={`h-8 ${ancho}`}>
        <SelectValue placeholder={todos} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{todos}</SelectItem>
        {opciones.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function CargaUf({ filas, guardarUf }: { filas: FilaVenta[]; guardarUf: (p: string, v: number) => Promise<void> }) {
  const [borradores, setBorradores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState<string | null>(null)

  const periodos = useMemo(() => {
    const vistos = new Map<string, number | null>()
    for (const f of filas) if (!vistos.has(f.periodo)) vistos.set(f.periodo, f.uf)
    return [...vistos.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [filas])

  async function guardar(periodo: string) {
    const valor = Number(borradores[periodo])
    if (!valor || valor <= 0) return toast.error('Ingresa un valor de UF mayor a cero')
    setGuardando(periodo)
    try {
      await guardarUf(periodo, valor)
      setBorradores((b) => ({ ...b, [periodo]: '' }))
      toast.success(`UF de ${etiquetaMes(periodo)} guardada`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar la UF')
    } finally {
      setGuardando(null)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div>
          <h3 className="text-sm font-bold">Valor de la UF por mes</h3>
          <p className="text-xs text-muted-foreground">
            Solo administradores. Mientras un mes no tenga UF cargada, su venta se muestra en pesos y no suma al total en UF.
            Se listan los meses del filtro actual.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {periodos.map(([periodo, uf]) => (
            <div key={periodo} className="flex items-center gap-2">
              <span className="w-24 text-sm">{etiquetaMes(periodo)}</span>
              {uf != null ? (
                <span className="text-sm text-muted-foreground">{uf.toLocaleString('es-CL')}</span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-warning">
                  <AlertTriangle size={13} /> sin cargar
                </span>
              )}
              <Input
                className="h-8 w-28"
                inputMode="decimal"
                placeholder={uf != null ? 'cambiar' : 'ej. 39500'}
                value={borradores[periodo] ?? ''}
                onChange={(e) => setBorradores((b) => ({ ...b, [periodo]: e.target.value }))}
              />
              <Button size="sm" variant="outline" disabled={guardando === periodo} onClick={() => guardar(periodo)}>
                {guardando === periodo ? '…' : 'Guardar'}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function Ventas({ esAdmin }: { esAdmin: boolean }) {
  const { filas, fuente, sincronizadoEn, loading, error, guardarUf } = useVentas()
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('linea')
  // null = todavía no se eligió: se usa el año más reciente con ventas.
  const [anioElegido, setAnioElegido] = useState<string | null>(null)
  const [mes, setMes] = useState(TODOS)
  const [linea, setLinea] = useState(TODOS)
  const [sucursal, setSucursal] = useState(TODOS)
  const [busqueda, setBusqueda] = useState('')
  const esSap = fuente === 'sap'

  const anios = useMemo(() => [...new Set(filas.map((f) => f.periodo.slice(0, 4)))].sort().reverse(), [filas])
  const anio = anioElegido ?? anios[0] ?? TODOS
  const lineas = useMemo(() => [...new Set(filas.flatMap((f) => f.lineas))].sort(), [filas])
  const sucursales = useMemo(
    () => [...new Set(filas.map((f) => f.sucursal).filter((s): s is string => !!s))].sort(),
    [filas],
  )

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return filas.filter(
      (f) =>
        (anio === TODOS || f.periodo.startsWith(anio)) &&
        (mes === TODOS || f.periodo.slice(5, 7) === mes) &&
        (linea === TODOS || (linea === 'sin' ? f.lineas.length === 0 : f.lineas.includes(linea))) &&
        (sucursal === TODOS || (sucursal === 'sin' ? !f.sucursal : f.sucursal === sucursal)) &&
        (!texto || f.proyecto.toLowerCase().includes(texto) || (f.cliente ?? '').toLowerCase().includes(texto)),
    )
  }, [filas, anio, mes, linea, sucursal, busqueda])

  const grupos = useMemo(() => agrupar(filtradas, agrupacion), [filtradas, agrupacion])
  const totalPesos = filtradas.reduce((a, f) => a + f.montoPesos, 0)
  const totalUnidades = filtradas.reduce((a, f) => a + (f.unidades ?? 0), 0)
  const proyectos = new Set(filtradas.filter((f) => f.proyectoId).map((f) => f.proyectoId)).size
  const mesesSinUf = [...new Set(filtradas.filter((f) => f.uf == null).map((f) => f.periodo))].sort()
  const etiquetaAgrupacion = AGRUPACIONES.find((a) => a.key === agrupacion)!.label

  if (loading) return <div className="h-24 animate-pulse rounded bg-muted" />
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (filas.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        {esSap
          ? 'Todavía no hay ventas de SAP que mostrar.'
          : 'Todavía no hay ventas que mostrar. La venta se reconoce al despachar: aparece acá cuando existan guías de despacho en los proyectos a los que tienes acceso.'}
      </p>
    )
  }

  function exportar() {
    exportarExcel(
      `ventas-${agrupacion}${anio !== TODOS ? `-${anio}` : ''}`,
      grupos.map((g) => ({
        [etiquetaAgrupacion.replace('Por ', '')]: g.clave,
        ...(esSap
          ? { 'Facturas (CLP)': g.facturas, 'Anticipos (CLP)': g.anticipos, 'Notas de crédito (CLP)': g.notasCredito }
          : { Unidades: g.unidades }),
        'Venta neta (CLP)': g.montoPesos,
        'Venta (UF)': g.montoUf ?? '',
        'UF incompleta': g.ufIncompleta ? 'sí' : '',
      })),
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {esSap
          ? `Fuente: SAP Business One (facturas + anticipos − notas de crédito, neto, como el libro de ventas). Actualizado ${
              sincronizadoEn ? new Date(sincronizadoEn).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—'
            }.`
          : 'Fuente: guías de despacho de los proyectos del portal.'}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Filtro
          valor={anio}
          onChange={setAnioElegido}
          todos="Todos los años"
          opciones={anios.map((a) => ({ value: a, label: a }))}
          ancho="w-36"
        />
        <Filtro
          valor={mes}
          onChange={setMes}
          todos="Todos los meses"
          opciones={MESES_LARGOS.map((m, i) => ({ value: String(i + 1).padStart(2, '0'), label: m }))}
          ancho="w-40"
        />
        <Filtro
          valor={linea}
          onChange={setLinea}
          todos="Todas las líneas"
          opciones={[...lineas.map((l) => ({ value: l, label: l })), { value: 'sin', label: 'Sin línea' }]}
          ancho="w-48"
        />
        <Filtro
          valor={sucursal}
          onChange={setSucursal}
          todos="Todas las sucursales"
          opciones={[...sucursales.map((s) => ({ value: s, label: s })), { value: 'sin', label: 'Sin sucursal' }]}
          ancho="w-48"
        />
        <Input
          className="h-8 w-60"
          placeholder={esSap ? 'Buscar proyecto o cliente…' : 'Buscar proyecto…'}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">VENTA NETA</p>
            <p className="text-xl font-extrabold tabular-nums">{formatCLP(totalPesos)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{esSap ? 'PROYECTOS CON VENTA' : 'UNIDADES DESPACHADAS'}</p>
            <p className="text-xl font-extrabold tabular-nums">{esSap ? proyectos : totalUnidades}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">PERÍODOS</p>
            <p className="text-xl font-extrabold tabular-nums">{new Set(filtradas.map((f) => f.periodo)).size}</p>
          </CardContent>
        </Card>
      </div>

      {mesesSinUf.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
          <span>
            UF sin cargar en{' '}
            <strong>
              {mesesSinUf.length <= 6 ? mesesSinUf.map(etiquetaMes).join(', ') : `${mesesSinUf.length} meses`}
            </strong>
            . Esos meses se muestran en pesos y no suman al total en UF.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {AGRUPACIONES.map((a) => (
          <Button
            key={a.key}
            size="sm"
            variant={agrupacion === a.key ? 'default' : 'outline'}
            onClick={() => setAgrupacion(a.key)}
          >
            {a.label}
          </Button>
        ))}
        <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={exportar}>
          <Download size={14} /> Exportar
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          {grupos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No hay ventas con estos filtros.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{etiquetaAgrupacion.replace('Por ', '')}</TableHead>
                  {esSap ? (
                    <>
                      <TableHead className="text-right">Facturas</TableHead>
                      <TableHead className="text-right">Anticipos</TableHead>
                      <TableHead className="text-right">Notas de crédito</TableHead>
                    </>
                  ) : (
                    <TableHead className="text-right">Unidades</TableHead>
                  )}
                  <TableHead className="text-right">Venta neta</TableHead>
                  <TableHead className="text-right">En UF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupos.map((g) => (
                  <TableRow key={g.clave}>
                    <TableCell className="font-medium">{g.clave}</TableCell>
                    {esSap ? (
                      <>
                        <TableCell className="text-right tabular-nums">{formatCLP(g.facturas)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCLP(g.anticipos)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCLP(g.notasCredito)}</TableCell>
                      </>
                    ) : (
                      <TableCell className="text-right tabular-nums">{g.unidades}</TableCell>
                    )}
                    <TableCell className="text-right font-semibold tabular-nums">{formatCLP(g.montoPesos)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUf(g.montoUf)}
                      {g.ufIncompleta && g.montoUf != null && (
                        <span className="ml-1 text-xs text-warning">parcial</span>
                      )}
                      {g.ufIncompleta && g.montoUf == null && <span className="ml-1 text-xs text-warning">sin UF</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {agrupacion === 'linea' && !esSap && (
            <p className="mt-2 text-xs text-muted-foreground">
              Un proyecto con más de una línea suma entero en cada una, así que la suma de las líneas puede superar la
              venta total de la empresa.
            </p>
          )}
          {agrupacion === 'linea' && esSap && (
            <p className="mt-2 text-xs text-muted-foreground">
              La línea y la sucursal salen del centro de costo de cada línea de la factura en SAP. "Sin línea" son
              centros de costo de administración o líneas sin centro de costo.
            </p>
          )}
        </CardContent>
      </Card>

      {esAdmin && <CargaUf filas={filtradas} guardarUf={guardarUf} />}
    </div>
  )
}
