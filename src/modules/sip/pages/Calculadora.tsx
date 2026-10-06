import { useMemo, useState } from 'react'
import { FileSpreadsheet, Plus, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Cargando, Vacio, selectClase } from '../components/comunes'
import { calcularMateriales, m2Panel } from '../lib/calculo'
import { exportarCalculoExcel } from '../lib/export'
import { fmtCant, fmtNum } from '../lib/formato'
import { usePermisosSip } from '../hooks/usePermisosSip'
import { useCatalogo } from '../hooks/useCatalogo'

let correlativo = 0
const fila = () => ({ key: ++correlativo, panel_id: '', cantidad: '' })

/** "X paneles de este tipo equivalen a Y materiales", sin registrar nada: para cotizar o planificar. */
export default function Calculadora() {
  const { puede } = usePermisosSip('consumo')
  const { panelesProducibles, recetas, materiales, panelPorId, loading } = useCatalogo()
  const [filas, setFilas] = useState([fila()])

  const pedido = filas.filter((f) => f.panel_id && Number(f.cantidad) > 0).map((f) => ({ panel_id: f.panel_id, cantidad: Number(f.cantidad) }))
  const resultado = useMemo(() => calcularMateriales(pedido, recetas, materiales), [pedido, recetas, materiales])
  const paneles = pedido.reduce((s, p) => s + p.cantidad, 0)
  const m2 = pedido.reduce((s, p) => s + p.cantidad * m2Panel(panelPorId.get(p.panel_id) ?? { ancho_mm: null, largo_mm: null }), 0)

  if (loading) return <Cargando />

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Paneles a fabricar</CardTitle>
          <p className="text-xs text-muted-foreground">Con la receta vigente de cada panel. No registra producción.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {filas.map((f, i) => (
            <div key={f.key} className="flex gap-2">
              <select
                value={f.panel_id}
                onChange={(e) => setFilas((fs) => fs.map((x) => (x.key === f.key ? { ...x, panel_id: e.target.value } : x)))}
                className={`${selectClase} min-w-0 flex-1`}
                aria-label={`Panel ${i + 1}`}
              >
                <option value="">Elegir panel…</option>
                {panelesProducibles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} · {p.descripcion}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={f.cantidad}
                onChange={(e) => setFilas((fs) => fs.map((x) => (x.key === f.key ? { ...x, cantidad: e.target.value } : x)))}
                placeholder="Cant."
                className="w-24"
                aria-label={`Cantidad ${i + 1}`}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setFilas((fs) => (fs.length === 1 ? [fila()] : fs.filter((x) => x.key !== f.key)))}
                aria-label="Quitar"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setFilas((fs) => [...fs, fila()])}>
            <Plus className="mr-1 h-4 w-4" /> Agregar panel
          </Button>
          {paneles > 0 && (
            <p className="pt-2 text-sm">
              <span className="font-mono-tabular font-bold">{fmtNum(paneles)}</span> paneles ·{' '}
              <span className="font-mono-tabular font-bold">{fmtNum(m2, 1)}</span> m²
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="text-base">Materiales necesarios</CardTitle>
          {puede('exportar') && resultado.materiales.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportarCalculoExcel(
                  pedido.map((p) => ({ codigo: panelPorId.get(p.panel_id)?.codigo ?? '', descripcion: panelPorId.get(p.panel_id)?.descripcion ?? '', cantidad: p.cantidad })),
                  resultado.materiales,
                )
              }
            >
              <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {resultado.materiales.length === 0 ? (
            <Vacio>Elija paneles y cantidades para ver los materiales.</Vacio>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Unidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultado.materiales.map((m) => (
                  <TableRow key={m.material_id}>
                    <TableCell>
                      <span className="font-mono-tabular text-xs text-muted-foreground">{m.codigo}</span> {m.descripcion}
                    </TableCell>
                    <TableCell className="text-right font-mono-tabular font-semibold">{fmtCant(m.total)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.unidad}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
