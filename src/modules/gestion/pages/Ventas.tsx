import { useMemo, useState } from 'react'
import { AlertTriangle, Download } from 'lucide-react'
import { toast } from 'sonner'
import { useVentas, type FilaVenta } from '../hooks/useVentas'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'

type Agrupacion = 'proyecto' | 'linea' | 'sucursal' | 'mes'

const AGRUPACIONES: { key: Agrupacion; label: string }[] = [
  { key: 'proyecto', label: 'Por proyecto' },
  { key: 'linea', label: 'Por línea' },
  { key: 'sucursal', label: 'Por sucursal' },
  { key: 'mes', label: 'Por mes' },
]

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

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
  unidades: number
  montoPesos: number
  montoUf: number | null
  /** true si algún mes del grupo no tiene UF cargada: el total en UF queda incompleto. */
  ufIncompleta: boolean
}

// Un proyecto con dos líneas suma entero en cada una — decisión explícita del
// plan §8.0, por eso el total por línea puede superar el total de la empresa.
function agrupar(filas: FilaVenta[], por: Agrupacion): Grupo[] {
  const mapa = new Map<string, Grupo>()
  const sumar = (clave: string, f: FilaVenta) => {
    // montoUf arranca en null, no en 0: si ningún mes del grupo tiene UF cargada,
    // el total tiene que leerse como "sin UF", nunca como una venta de UF 0.
    const g = mapa.get(clave) ?? { clave, unidades: 0, montoPesos: 0, montoUf: null as number | null, ufIncompleta: false }
    g.unidades += f.unidades
    g.montoPesos += f.montoPesos
    if (f.montoUf == null) g.ufIncompleta = true
    else g.montoUf = (g.montoUf ?? 0) + f.montoUf
    mapa.set(clave, g)
  }
  for (const f of filas) {
    if (por === 'linea') {
      if (f.lineas.length === 0) sumar('Sin línea', f)
      else f.lineas.forEach((l) => sumar(l, f))
    } else if (por === 'sucursal') sumar(f.sucursal ?? 'Sin sucursal', f)
    else if (por === 'mes') sumar(etiquetaMes(f.periodo), f)
    else sumar(f.proyecto, f)
  }
  return [...mapa.values()].sort((a, b) => b.montoPesos - a.montoPesos)
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
    if (!valor || valor <= 0) return toast.error('Ingresá un valor de UF mayor a cero')
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
  const { filas, loading, error, guardarUf } = useVentas()
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('linea')

  const grupos = useMemo(() => agrupar(filas, agrupacion), [filas, agrupacion])
  const totalPesos = filas.reduce((a, f) => a + f.montoPesos, 0)
  const totalUnidades = filas.reduce((a, f) => a + f.unidades, 0)
  const mesesSinUf = [...new Set(filas.filter((f) => f.uf == null).map((f) => etiquetaMes(f.periodo)))]

  if (loading) return <div className="h-24 animate-pulse rounded bg-muted" />
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (filas.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Todavía no hay ventas que mostrar. La venta se reconoce al despachar: aparece acá cuando existan guías de
        despacho en los proyectos a los que tenés acceso.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">VENTA TOTAL</p>
            <p className="text-xl font-extrabold tabular-nums">{formatCLP(totalPesos)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">UNIDADES DESPACHADAS</p>
            <p className="text-xl font-extrabold tabular-nums">{totalUnidades}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">PERÍODOS</p>
            <p className="text-xl font-extrabold tabular-nums">{new Set(filas.map((f) => f.periodo)).size}</p>
          </CardContent>
        </Card>
      </div>

      {mesesSinUf.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
          <span>
            UF sin cargar en: <strong>{mesesSinUf.join(', ')}</strong>. Esos meses se muestran en pesos y no suman al
            total en UF.
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
        <Button
          size="sm"
          variant="outline"
          className="ml-auto gap-1.5"
          onClick={() =>
            exportarExcel(
              `ventas-${agrupacion}`,
              grupos.map((g) => ({
                [AGRUPACIONES.find((a) => a.key === agrupacion)!.label]: g.clave,
                Unidades: g.unidades,
                'Monto neto (CLP)': g.montoPesos,
                'Monto (UF)': g.montoUf ?? '',
                'UF incompleta': g.ufIncompleta ? 'sí' : '',
              })),
            )
          }
        >
          <Download size={14} /> Exportar
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{AGRUPACIONES.find((a) => a.key === agrupacion)!.label.replace('Por ', '')}</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead className="text-right">Monto neto</TableHead>
                <TableHead className="text-right">En UF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupos.map((g) => (
                <TableRow key={g.clave}>
                  <TableCell className="font-medium">{g.clave}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.unidades}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCLP(g.montoPesos)}</TableCell>
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
          {agrupacion === 'linea' && (
            <p className="mt-2 text-xs text-muted-foreground">
              Un proyecto con más de una línea suma entero en cada una, así que la suma de las líneas puede superar la
              venta total de la empresa.
            </p>
          )}
        </CardContent>
      </Card>

      {esAdmin && <CargaUf filas={filas} guardarUf={guardarUf} />}
    </div>
  )
}
