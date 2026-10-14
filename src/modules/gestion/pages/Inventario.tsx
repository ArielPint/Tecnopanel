import { useMemo, useState } from 'react'
import { AlertTriangle, Download } from 'lucide-react'
import { useInventario, type FilaStock } from '../hooks/useInventario'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'

type Vista = 'articulo' | 'grupo' | 'bodega'

const VISTAS: { key: Vista; label: string }[] = [
  { key: 'articulo', label: 'Por artículo' },
  { key: 'grupo', label: 'Por grupo' },
  { key: 'bodega', label: 'Por bodega' },
]

const TODOS = 'todos'
// Más filas que esto ponen lenta la tabla; el Excel siempre lleva todo.
const MAX_FILAS = 400

function formatCantidad(valor: number): string {
  return valor.toLocaleString('es-CL', { maximumFractionDigits: 2 })
}

/** Disponible negativo (se comprometió más de lo que hay y lo pedido no alcanza) o bajo el mínimo de SAP. */
function conFaltante(a: { disponible: number; enStock: number; stockMinimo: number }): boolean {
  return a.disponible < 0 || (a.stockMinimo > 0 && a.enStock < a.stockMinimo)
}

interface Articulo {
  codigo: string
  articulo: string
  grupo: string | null
  unidad: string | null
  bodegas: string[]
  enStock: number
  comprometido: number
  pedido: number
  disponible: number
  stockMinimo: number
  costoPromedio: number
  valor: number
  inactivo: boolean
}

// Un artículo suma sus bodegas (las del filtro). El costo promedio es uno solo por artículo en SAP.
function porArticulo(filas: FilaStock[]): Articulo[] {
  const mapa = new Map<string, Articulo>()
  for (const f of filas) {
    const a = mapa.get(f.codigo) ?? {
      codigo: f.codigo, articulo: f.articulo, grupo: f.grupo, unidad: f.unidad, bodegas: [],
      enStock: 0, comprometido: 0, pedido: 0, disponible: 0, stockMinimo: 0,
      costoPromedio: f.costoPromedio, valor: 0, inactivo: f.inactivo,
    }
    if (f.enStock !== 0) a.bodegas.push(f.bodegaCodigo)
    a.enStock += f.enStock
    a.comprometido += f.comprometido
    a.pedido += f.pedido
    a.disponible += f.disponible
    a.stockMinimo += f.stockMinimo
    a.valor += f.valor
    mapa.set(f.codigo, a)
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor)
}

interface Grupo {
  clave: string
  articulos: number
  conFaltante: number
  valor: number
}

function agrupar(filas: FilaStock[], por: 'grupo' | 'bodega'): Grupo[] {
  const mapa = new Map<string, { articulos: Set<string>; faltantes: Set<string>; valor: number }>()
  for (const f of filas) {
    const clave = por === 'grupo' ? f.grupo ?? 'Sin grupo' : f.bodega
    const g = mapa.get(clave) ?? { articulos: new Set<string>(), faltantes: new Set<string>(), valor: 0 }
    if (f.enStock !== 0) g.articulos.add(f.codigo)
    if (conFaltante(f)) g.faltantes.add(f.codigo)
    g.valor += f.valor
    mapa.set(clave, g)
  }
  return [...mapa.entries()]
    .map(([clave, g]) => ({ clave, articulos: g.articulos.size, conFaltante: g.faltantes.size, valor: g.valor }))
    .sort((a, b) => b.valor - a.valor)
}

function Filtro({
  valor, onChange, todos, opciones, ancho = 'w-48',
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

export default function Inventario() {
  const { filas, disponible, sincronizadoEn, loading, error } = useInventario()
  const [vista, setVista] = useState<Vista>('articulo')
  const [bodega, setBodega] = useState(TODOS)
  const [grupo, setGrupo] = useState(TODOS)
  const [busqueda, setBusqueda] = useState('')
  const [soloConStock, setSoloConStock] = useState(true)
  const [soloFaltantes, setSoloFaltantes] = useState(false)

  const bodegas = useMemo(
    () => [...new Map(filas.map((f) => [f.bodegaCodigo, f.bodega])).entries()].sort((a, b) => a[0].localeCompare(b[0])),
    [filas],
  )
  const grupos = useMemo(
    () => [...new Set(filas.map((f) => f.grupo).filter((g): g is string => !!g))].sort(),
    [filas],
  )

  // Filtros por fila (bodega, grupo, texto); "con stock" y "faltantes" se aplican al artículo ya sumado.
  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return filas.filter(
      (f) =>
        (bodega === TODOS || f.bodegaCodigo === bodega) &&
        (grupo === TODOS || (grupo === 'sin' ? !f.grupo : f.grupo === grupo)) &&
        (!texto || f.codigo.toLowerCase().includes(texto) || f.articulo.toLowerCase().includes(texto)),
    )
  }, [filas, bodega, grupo, busqueda])

  const articulos = useMemo(
    () =>
      porArticulo(filtradas).filter(
        (a) => (!soloConStock || a.enStock !== 0) && (!soloFaltantes || conFaltante(a)),
      ),
    [filtradas, soloConStock, soloFaltantes],
  )
  const codigosVisibles = useMemo(() => new Set(articulos.map((a) => a.codigo)), [articulos])
  const filasVisibles = useMemo(() => filtradas.filter((f) => codigosVisibles.has(f.codigo)), [filtradas, codigosVisibles])
  const resumen = useMemo(
    () => (vista === 'articulo' ? [] : agrupar(filasVisibles, vista)),
    [filasVisibles, vista],
  )

  const valorTotal = articulos.reduce((s, a) => s + a.valor, 0)
  const conStock = articulos.filter((a) => a.enStock !== 0).length
  const faltantes = articulos.filter(conFaltante).length

  if (loading) return <div className="h-24 animate-pulse rounded bg-muted" />
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!disponible) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        El inventario se lee de SAP y solo está disponible en el portal del servidor propio.
      </p>
    )
  }
  if (filas.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Todavía no hay stock de SAP que mostrar.
      </p>
    )
  }

  function exportar() {
    const sufijo = bodega !== TODOS ? `-${bodega}` : ''
    if (vista === 'articulo') {
      exportarExcel(
        `stock${sufijo}`,
        articulos.map((a) => ({
          Código: a.codigo,
          Artículo: a.articulo,
          Grupo: a.grupo ?? '',
          Unidad: a.unidad ?? '',
          Bodegas: a.bodegas.join(', '),
          'En stock': a.enStock,
          Comprometido: a.comprometido,
          Pedido: a.pedido,
          Disponible: a.disponible,
          'Stock mínimo': a.stockMinimo,
          'Costo promedio (CLP)': a.costoPromedio,
          'Valor (CLP)': a.valor,
          Faltante: conFaltante(a) ? 'sí' : '',
          Inactivo: a.inactivo ? 'sí' : '',
        })),
      )
      return
    }
    exportarExcel(
      `stock-por-${vista}${sufijo}`,
      resumen.map((g) => ({
        [vista === 'grupo' ? 'Grupo' : 'Bodega']: g.clave,
        'Artículos con stock': g.articulos,
        'Con faltante': g.conFaltante,
        'Valor (CLP)': g.valor,
        '% del valor': valorTotal ? g.valor / valorTotal : 0,
      })),
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Fuente: SAP Business One (stock por artículo y bodega, valorizado a costo promedio). Actualizado{' '}
        {sincronizadoEn ? new Date(sincronizadoEn).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
        , se refresca cada hora de 07:00 a 20:00.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Filtro
          valor={bodega}
          onChange={setBodega}
          todos="Todas las bodegas"
          opciones={bodegas.map(([codigo, nombre]) => ({ value: codigo, label: nombre }))}
          ancho="w-56"
        />
        <Filtro
          valor={grupo}
          onChange={setGrupo}
          todos="Todos los grupos"
          opciones={[...grupos.map((g) => ({ value: g, label: g })), { value: 'sin', label: 'Sin grupo' }]}
        />
        <Input
          className="h-8 w-64"
          placeholder="Buscar código o artículo…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <Button size="sm" variant={soloConStock ? 'default' : 'outline'} onClick={() => setSoloConStock((v) => !v)}>
          Solo con stock
        </Button>
        <Button size="sm" variant={soloFaltantes ? 'default' : 'outline'} onClick={() => setSoloFaltantes((v) => !v)}>
          Solo con faltante
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">VALOR DEL STOCK</p>
            <p className="text-xl font-extrabold tabular-nums">{formatCLP(valorTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">ARTÍCULOS CON STOCK</p>
            <p className="text-xl font-extrabold tabular-nums">{conStock}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">CON FALTANTE</p>
            <p className={`text-xl font-extrabold tabular-nums ${faltantes > 0 ? 'text-warning' : ''}`}>{faltantes}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {VISTAS.map((v) => (
          <Button key={v.key} size="sm" variant={vista === v.key ? 'default' : 'outline'} onClick={() => setVista(v.key)}>
            {v.label}
          </Button>
        ))}
        <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={exportar}>
          <Download size={14} /> Exportar
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          {articulos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No hay artículos con estos filtros.</p>
          ) : vista === 'articulo' ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Artículo</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead className="text-right">En stock</TableHead>
                    <TableHead className="text-right">Comprometido</TableHead>
                    <TableHead className="text-right">Pedido</TableHead>
                    <TableHead className="text-right">Disponible</TableHead>
                    <TableHead className="text-right">Costo prom.</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {articulos.slice(0, MAX_FILAS).map((a) => (
                    <TableRow key={a.codigo}>
                      <TableCell className="tabular-nums">{a.codigo}</TableCell>
                      <TableCell className="font-medium">
                        {a.articulo}
                        {a.inactivo && <span className="ml-1 text-xs text-muted-foreground">(inactivo)</span>}
                        {bodega === TODOS && a.bodegas.length > 0 && (
                          <span className="block text-xs text-muted-foreground">{a.bodegas.join(' · ')}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.grupo ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCantidad(a.enStock)} <span className="text-xs text-muted-foreground">{a.unidad}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCantidad(a.comprometido)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCantidad(a.pedido)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${conFaltante(a) ? 'font-semibold text-warning' : ''}`}>
                        {conFaltante(a) && <AlertTriangle size={12} className="mr-1 inline" />}
                        {formatCantidad(a.disponible)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCLP(a.costoPromedio)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatCLP(a.valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {articulos.length > MAX_FILAS && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Se muestran los {MAX_FILAS} de mayor valor de {articulos.length}. Filtra o exporta para verlos todos.
                </p>
              )}
            </>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{vista === 'grupo' ? 'Grupo' : 'Bodega'}</TableHead>
                  <TableHead className="text-right">Artículos con stock</TableHead>
                  <TableHead className="text-right">Con faltante</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">% del valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumen.map((g) => (
                  <TableRow key={g.clave}>
                    <TableCell className="font-medium">{g.clave}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.articulos}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.conFaltante || '—'}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatCLP(g.valor)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {valorTotal ? `${((g.valor / valorTotal) * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Disponible = en stock − comprometido + pedido, como en SAP. "Con faltante" = disponible negativo o stock bajo el
            mínimo definido en SAP.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
