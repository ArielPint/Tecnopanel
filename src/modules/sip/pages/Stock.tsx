import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { cn } from '@/lib/utils'
import { Cargando, Encabezado, Tile, Vacio } from '../components/comunes'
import { guardarStockInicial, listarStock, type StockPanel } from '../lib/api'
import { fmtFechaHora, fmtNum } from '../lib/formato'
import { usePermisosSip } from '../hooks/usePermisosSip'

/** Stock de paneles: inicial (se carga aquí) + fabricados − cortados − rechazados al cortar. */
export default function Stock() {
  const { puede } = usePermisosSip('stock')
  const editable = puede('editar')
  const [filas, setFilas] = useState<StockPanel[]>([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [soloConStock, setSoloConStock] = useState(false)
  const [editando, setEditando] = useState<{ panel_id: string; valor: string } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const recargar = useCallback(async () => {
    try {
      setFilas(await listarStock())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return filas.filter((f) => (!soloConStock || f.disponible !== 0) && (!q || `${f.panel_codigo} ${f.panel_descripcion}`.toLowerCase().includes(q)))
  }, [filas, texto, soloConStock])

  const totales = useMemo(
    () => filas.reduce((t, f) => ({ disponible: t.disponible + f.disponible, fabricados: t.fabricados + f.fabricados, cortados: t.cortados + f.cortados }), { disponible: 0, fabricados: 0, cortados: 0 }),
    [filas],
  )

  async function guardar() {
    if (!editando) return
    const n = editando.valor.trim() === '' ? 0 : Number(editando.valor)
    if (!Number.isInteger(n) || n < 0) return toast.error('El stock inicial debe ser un número entero, sin negativos')
    setGuardando(true)
    try {
      await guardarStockInicial(editando.panel_id, n)
      toast.success('Stock inicial guardado')
      setEditando(null)
      await recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Stock de paneles"
        descripcion="Paneles SIP disponibles para cortar: stock inicial + fabricados − cortados − rechazados al cortar."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile titulo="Disponibles" valor={fmtNum(totales.disponible)} detalle="Todos los paneles" />
        <Tile titulo="Fabricados" valor={fmtNum(totales.fabricados)} detalle="Buenos, en el registro de producción" />
        <Tile titulo="Cortados" valor={fmtNum(totales.cortados)} detalle="En el registro de cortes" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar panel" value={texto} onChange={(e) => setTexto(e.target.value)} className="pl-8" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={soloConStock} onCheckedChange={(v) => setSoloConStock(v === true)} />
          Solo con stock
        </label>
      </div>
      {editable && (
        <p className="text-xs text-muted-foreground">
          El stock inicial es lo que había en bodega antes de registrar en el portal. No puedes dejarlo por debajo de lo ya cortado.
        </p>
      )}

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <Cargando />
          ) : filtradas.length === 0 ? (
            <Vacio>Ningún panel coincide con la búsqueda.</Vacio>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Panel</TableHead>
                    <TableHead className="text-right">Inicial</TableHead>
                    <TableHead className="text-right">+ Fabricados</TableHead>
                    <TableHead className="text-right">− Cortados</TableHead>
                    <TableHead className="text-right">− Rech. corte</TableHead>
                    <TableHead className="text-right">= Disponible</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map((f) => (
                    <TableRow key={f.panel_id} className={f.activo ? undefined : 'opacity-60'}>
                      <TableCell>
                        <div className="font-mono-tabular font-semibold">{f.panel_codigo}</div>
                        <div className="text-xs text-muted-foreground">{f.panel_descripcion}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        {editando?.panel_id === f.panel_id ? (
                          <form
                            className="flex items-center justify-end gap-1"
                            onSubmit={(e) => {
                              e.preventDefault()
                              guardar()
                            }}
                          >
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={1}
                              autoFocus
                              value={editando.valor}
                              onChange={(e) => setEditando({ ...editando, valor: e.target.value })}
                              className="h-8 w-24 text-right"
                              aria-label={`Stock inicial de ${f.panel_codigo}`}
                            />
                            <Button type="submit" size="icon" variant="ghost" className="h-8 w-8" disabled={guardando} aria-label="Guardar">
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditando(null)} aria-label="Cancelar">
                              <X className="h-4 w-4" />
                            </Button>
                          </form>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <span className="font-mono-tabular" title={f.inicial_actualizado ? `Actualizado ${fmtFechaHora(f.inicial_actualizado)}` : undefined}>
                              {fmtNum(f.inicial)}
                            </span>
                            {editable && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => setEditando({ panel_id: f.panel_id, valor: String(f.inicial) })}
                                aria-label={`Editar stock inicial de ${f.panel_codigo}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono-tabular">{fmtNum(f.fabricados)}</TableCell>
                      <TableCell className="text-right font-mono-tabular">{fmtNum(f.cortados)}</TableCell>
                      <TableCell className="text-right font-mono-tabular">{f.rechazados_corte ? fmtNum(f.rechazados_corte) : '—'}</TableCell>
                      <TableCell className={cn('text-right font-mono-tabular font-bold', f.disponible === 0 && 'text-muted-foreground')}>{fmtNum(f.disponible)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
