import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Cargando, SelectorPeriodo, Tile, Vacio, selectClase, usePeriodo } from '../components/comunes'
import { listarConsumos, type ConsumoV } from '../lib/api'
import { consumoPorMaterial } from '../lib/calculo'
import { exportarConsumoExcel } from '../lib/export'
import { fmtCant, fmtFecha, fmtNum } from '../lib/formato'
import { usePermisosSip } from '../hooks/usePermisosSip'
import { useCatalogo } from '../hooks/useCatalogo'

/** Consumo real registrado: lo que produjeron los registros del período, con la receta copiada al registrar. */
export default function Consumo() {
  const { puede } = usePermisosSip('consumo')
  const { paneles } = useCatalogo()
  const periodo = usePeriodo('mes')
  const [consumos, setConsumos] = useState<ConsumoV[]>([])
  const [loading, setLoading] = useState(true)
  const [panelId, setPanelId] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    listarConsumos(periodo.desde, periodo.hasta)
      .then((c) => !cancelado && setConsumos(c))
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => !cancelado && setLoading(false))
    return () => {
      cancelado = true
    }
  }, [periodo.desde, periodo.hasta])

  const filtrados = useMemo(() => (panelId ? consumos.filter((c) => c.panel_id === panelId) : consumos), [consumos, panelId])
  const resumen = useMemo(() => consumoPorMaterial(filtrados), [filtrados])

  // desglose de un material por panel
  const desglose = useMemo(() => {
    if (!abierto) return []
    const m = new Map<string, { codigo: string; total: number }>()
    for (const c of filtrados) {
      if (c.material_id !== abierto) continue
      const f = m.get(c.panel_id) ?? { codigo: c.panel_codigo, total: 0 }
      f.total += c.cantidad_total
      m.set(c.panel_id, f)
    }
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [abierto, filtrados])

  const lineas = new Set(filtrados.map((c) => c.linea_id)).size
  const conMerma = resumen.filter((m) => m.merma > 0).length

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile titulo="Materiales" valor={fmtNum(resumen.length)} detalle={`${fmtFecha(periodo.desde)} al ${fmtFecha(periodo.hasta)}`} />
        <Tile titulo="Líneas de producción" valor={fmtNum(lineas)} detalle="Paneles registrados que consumieron" />
        <Tile titulo="Con merma" valor={fmtNum(conMerma)} detalle="Materiales gastados en rechazados" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SelectorPeriodo periodo={periodo} />
        <select value={panelId} onChange={(e) => setPanelId(e.target.value)} className={`${selectClase} w-auto max-w-[280px]`} aria-label="Panel">
          <option value="">Todos los paneles</option>
          {paneles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.codigo} · {p.descripcion}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        {puede('exportar') && (
          <Button variant="outline" onClick={() => exportarConsumoExcel(resumen, filtrados, periodo.desde, periodo.hasta)} disabled={resumen.length === 0}>
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <Cargando />
          ) : resumen.length === 0 ? (
            <Vacio>No hay producción registrada en este período.</Vacio>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Paneles buenos</TableHead>
                    <TableHead className="text-right">Merma</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Unidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resumen.map((m) => {
                    const esAbierto = abierto === m.material_id
                    return (
                      <Fragment key={m.material_id}>
                        <TableRow className="cursor-pointer" onClick={() => setAbierto(esAbierto ? null : m.material_id)} aria-expanded={esAbierto}>
                          <TableCell>
                            <div className="flex items-start gap-1.5">
                              {esAbierto ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                              <span>
                                <span className="font-mono-tabular text-xs text-muted-foreground">{m.codigo}</span> {m.descripcion}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono-tabular">{fmtCant(m.buenos)}</TableCell>
                          <TableCell className="text-right font-mono-tabular">{m.merma ? fmtCant(m.merma) : '—'}</TableCell>
                          <TableCell className="text-right font-mono-tabular font-semibold">{fmtCant(m.total)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{m.unidad}</TableCell>
                        </TableRow>
                        {esAbierto &&
                          desglose.map((d) => (
                            <TableRow key={d.codigo} className="bg-muted/40 hover:bg-muted/40">
                              <TableCell className="pl-10 text-sm">
                                Panel <span className="font-mono-tabular font-semibold">{d.codigo}</span>
                              </TableCell>
                              <TableCell colSpan={2} />
                              <TableCell className="text-right font-mono-tabular text-sm">{fmtCant(d.total)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{m.unidad}</TableCell>
                            </TableRow>
                          ))}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                Merma = material de los paneles rechazados. Cada registro usa la receta que tenía el panel al registrarlo. Haga clic en un material para ver
                cuánto se fue en cada panel.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
