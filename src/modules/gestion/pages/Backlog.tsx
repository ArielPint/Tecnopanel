import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useBacklog, type FilaBacklog } from '../hooks/useBacklog'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'

type Agrupacion = 'proyecto' | 'cliente' | 'linea' | 'sucursal'

const AGRUPACIONES: { key: Agrupacion; label: string }[] = [
  { key: 'proyecto', label: 'Por proyecto' },
  { key: 'cliente', label: 'Por cliente' },
  { key: 'linea', label: 'Por línea' },
  { key: 'sucursal', label: 'Por sucursal' },
]

const TODOS = 'todos'

interface Grupo {
  clave: string
  cliente: string | null
  linea: string | null
  sucursal: string | null
  proyectos: number
  contratado: number
  facturado: number
  /** Despachado con guías + facturado sin guía: lo que rebaja el backlog. */
  ejecutado: number
  backlog: number
}

function porcentaje(parte: number, contratado: number): string {
  if (contratado <= 0) return '—'
  return `${Math.round((parte / contratado) * 100)}%`
}

function agrupar(filas: FilaBacklog[], por: Agrupacion): Grupo[] {
  const mapa = new Map<string, Grupo>()
  for (const f of filas) {
    const clave =
      por === 'cliente' ? f.cliente ?? 'Sin cliente'
      : por === 'linea' ? f.linea ?? 'Sin línea'
      : por === 'sucursal' ? f.sucursal ?? 'Sin sucursal'
      : f.proyecto
    const g = mapa.get(clave) ?? {
      clave, cliente: f.cliente, linea: f.linea, sucursal: f.sucursal, proyectos: 0, contratado: 0, facturado: 0, ejecutado: 0, backlog: 0,
    }
    g.proyectos += 1
    g.contratado += f.contratado
    g.facturado += f.facturado
    g.ejecutado += f.despachado + f.facturadoDirecto
    g.backlog += f.backlog
    mapa.set(clave, g)
  }
  return [...mapa.values()].sort((a, b) => b.backlog - a.backlog)
}

function Filtro({
  valor, onChange, todos, opciones,
}: {
  valor: string
  onChange: (v: string) => void
  todos: string
  opciones: { value: string; label: string }[]
}) {
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-48">
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

export default function Backlog() {
  const { filas: todas, disponible, sincronizadoEn, loading, error } = useBacklog()
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('proyecto')
  const [linea, setLinea] = useState(TODOS)
  const [sucursal, setSucursal] = useState(TODOS)
  const [busqueda, setBusqueda] = useState('')

  // Proyectos con el pedido abierto pero ya despachados o facturados entero (o de más): no son backlog.
  const filas = useMemo(() => todas.filter((f) => f.backlog > 0), [todas])
  const sinSaldo = todas.length - filas.length
  const lineas = useMemo(() => [...new Set(filas.map((f) => f.linea).filter((l): l is string => !!l))].sort(), [filas])
  const sucursales = useMemo(
    () => [...new Set(filas.map((f) => f.sucursal).filter((s): s is string => !!s))].sort(),
    [filas],
  )

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return filas.filter(
      (f) =>
        (linea === TODOS || (linea === 'sin' ? !f.linea : f.linea === linea)) &&
        (sucursal === TODOS || (sucursal === 'sin' ? !f.sucursal : f.sucursal === sucursal)) &&
        (!texto || f.proyecto.toLowerCase().includes(texto) || (f.cliente ?? '').toLowerCase().includes(texto)),
    )
  }, [filas, linea, sucursal, busqueda])

  const grupos = useMemo(() => agrupar(filtradas, agrupacion), [filtradas, agrupacion])
  const totalBacklog = filtradas.reduce((a, f) => a + f.backlog, 0)
  const totalContratado = filtradas.reduce((a, f) => a + f.contratado, 0)
  const totalFacturado = filtradas.reduce((a, f) => a + f.facturado, 0)
  const totalEjecutado = filtradas.reduce((a, f) => a + f.despachado + f.facturadoDirecto, 0)
  const etiqueta = AGRUPACIONES.find((a) => a.key === agrupacion)!.label.replace('Por ', '')
  const porProyecto = agrupacion === 'proyecto'

  if (loading) return <div className="h-24 animate-pulse rounded bg-muted" />
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!disponible) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        El backlog viene de SAP y solo está disponible en el portal del servidor de Tecnopanel.
      </p>
    )
  }
  if (filas.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        No hay proyectos con saldo por facturar en notas de venta abiertas de SAP.
      </p>
    )
  }

  function exportar() {
    exportarExcel(
      `backlog-${agrupacion}`,
      grupos.map((g) => ({
        [etiqueta]: g.clave,
        ...(porProyecto
          ? { Cliente: g.cliente ?? '', Línea: g.linea ?? '', Sucursal: g.sucursal ?? '' }
          : { Proyectos: g.proyectos }),
        'Contratado (CLP)': g.contratado,
        'Despachado + facturado sin guía (CLP)': g.ejecutado,
        '% avance': g.contratado > 0 ? g.ejecutado / g.contratado : '',
        'Facturado (CLP)': g.facturado,
        'Backlog (CLP)': g.backlog,
      })),
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Fuente: SAP Business One. Backlog = notas de venta del proyecto (neto) − lo despachado con guías (menos
        devoluciones) − las facturas que no salen de una guía. Los anticipos no rebajan. Solo proyectos con alguna nota de
        venta abierta. Actualizado{' '}
        {sincronizadoEn ? new Date(sincronizadoEn).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—'}.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Filtro
          valor={linea}
          onChange={setLinea}
          todos="Todas las líneas"
          opciones={[...lineas.map((l) => ({ value: l, label: l })), { value: 'sin', label: 'Sin línea' }]}
        />
        <Filtro
          valor={sucursal}
          onChange={setSucursal}
          todos="Todas las sucursales"
          opciones={[...sucursales.map((s) => ({ value: s, label: s })), { value: 'sin', label: 'Sin sucursal' }]}
        />
        <Input
          className="h-8 w-60"
          placeholder="Buscar proyecto o cliente…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">BACKLOG</p>
            <p className="text-xl font-extrabold tabular-nums">{formatCLP(totalBacklog)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">CONTRATADO</p>
            <p className="text-xl font-extrabold tabular-nums">{formatCLP(totalContratado)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">DESPACHADO</p>
            <p className="text-xl font-extrabold tabular-nums">
              {formatCLP(totalEjecutado)}{' '}
              <span className="text-sm font-semibold text-muted-foreground">{porcentaje(totalEjecutado, totalContratado)}</span>
            </p>
            <p className="text-xs text-muted-foreground">Facturado {formatCLP(totalFacturado)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">PROYECTOS</p>
            <p className="text-xl font-extrabold tabular-nums">{filtradas.length}</p>
          </CardContent>
        </Card>
      </div>

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
            <p className="py-6 text-center text-sm text-muted-foreground">No hay backlog con estos filtros.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{etiqueta}</TableHead>
                  {porProyecto ? (
                    <>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Línea</TableHead>
                    </>
                  ) : (
                    <TableHead className="text-right">Proyectos</TableHead>
                  )}
                  <TableHead className="text-right">Contratado</TableHead>
                  <TableHead className="text-right">Despachado</TableHead>
                  <TableHead className="text-right">% avance</TableHead>
                  <TableHead className="text-right">Facturado</TableHead>
                  <TableHead className="text-right">Backlog</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupos.map((g) => (
                  <TableRow key={g.clave}>
                    <TableCell className="font-medium">{g.clave}</TableCell>
                    {porProyecto ? (
                      <>
                        <TableCell className="text-sm text-muted-foreground">{g.cliente ?? '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {g.linea ?? 'Sin línea'}
                          {g.sucursal && <span className="block text-xs">{g.sucursal}</span>}
                        </TableCell>
                      </>
                    ) : (
                      <TableCell className="text-right tabular-nums">{g.proyectos}</TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">{formatCLP(g.contratado)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCLP(g.ejecutado)}</TableCell>
                    <TableCell className="text-right tabular-nums">{porcentaje(g.ejecutado, g.contratado)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatCLP(g.facturado)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatCLP(g.backlog)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            La línea y la sucursal de cada proyecto son las del centro de costo con más monto en sus notas de venta.
            "Despachado" son las guías de despacho menos devoluciones, más lo facturado sin guía; lo facturado desde una
            guía no se cuenta dos veces. "Facturado" es el de Ventas (incluye anticipos) y es solo informativo. Cuando SAP
            cierra la última nota de venta abierta del proyecto, este sale del backlog.
            {sinSaldo > 0 &&
              ` ${sinSaldo} proyecto${sinSaldo === 1 ? '' : 's'} con nota de venta abierta ya despachado${sinSaldo === 1 ? '' : 's'} completo${sinSaldo === 1 ? '' : 's'} no se muestra${sinSaldo === 1 ? '' : 'n'}.`}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
