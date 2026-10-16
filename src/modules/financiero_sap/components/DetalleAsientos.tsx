import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'
import { formatCLP, formatFecha } from '@/modules/financiero/utils/formatters'
import { pesos } from '../lib/formato'
import { cargarAsientos, MAX_ASIENTOS, type Asiento, type Catalogos, type FiltroAsientos } from '../lib/api'
import { TIPOS_TRANSACCION } from '../lib/catalogos'

export interface PedidoDetalle {
  titulo: string
  subtitulo: string
  filtro: FiltroAsientos
  /** Cifra de la celda (incluye lo prorrateado) */
  monto: number
  /** Parte de la cifra que es administración repartida: no tiene asientos propios */
  prorrateado: number
  /** Cuentas de balance: movimientos del mes con saldo inicial y final. signo 1 activos, -1 pasivos y patrimonio */
  balance?: { signo: 1 | -1 }
}

export default function DetalleAsientos({ pedido, catalogos, onClose }: { pedido: PedidoDetalle | null; catalogos: Catalogos; onClose: () => void }) {
  const [asientos, setAsientos] = useState<Asiento[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pedido) return
    let cancelado = false
    setAsientos(null)
    setError(null)
    cargarAsientos(pedido.filtro)
      .then((a) => !cancelado && setAsientos(a))
      .catch((e) => !cancelado && setError(e.message))
    return () => {
      cancelado = true
    }
  }, [pedido])

  const cuentas = useMemo(() => new Map(catalogos.cuentas.map((c) => [c.codigo, c])), [catalogos])
  const cecos = useMemo(() => new Map(catalogos.cecos.map((c) => [c.codigo, c])), [catalogos])
  const dim2 = useMemo(() => new Map(catalogos.dim2.map((d) => [d.codigo, d.nombre])), [catalogos])

  const lista = asientos?.slice(0, MAX_ASIENTOS) ?? []
  const hayMas = (asientos?.length ?? 0) > MAX_ASIENTOS
  const totalDebe = lista.reduce((s, a) => s + a.debe, 0)
  const totalHaber = lista.reduce((s, a) => s + a.haber, 0)
  const varias = (pedido?.filtro.cuentas.length ?? 0) > 1
  const bal = pedido?.balance
  // saldo al cierre = saldo inicial + movimientos del mes (con el signo de la sección)
  const movimientoMes = bal ? bal.signo * (totalDebe - totalHaber) : 0

  async function exportar() {
    if (!pedido) return
    try {
      await exportarExcel(
        `asientos-${pedido.titulo}`.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '').slice(0, 80),
        lista.map((a) => ({
          Fecha: a.fecha,
          'N° asiento': a.numero,
          Tipo: TIPOS_TRANSACCION[a.tipo_trans] ?? a.tipo_trans,
          Referencia: a.referencia,
          Glosa: a.glosa,
          Cuenta: cuentas.get(a.cuenta)?.codigo_formato ?? a.cuenta,
          'Nombre cuenta': cuentas.get(a.cuenta)?.nombre,
          CECO: a.ceco,
          'Tarea WIP': a.dim2 ? `${a.dim2} ${dim2.get(a.dim2) ?? ''}`.trim() : '',
          Proyecto: a.proyecto,
          Debe: a.debe,
          Haber: a.haber,
          'Haber - debe': a.haber - a.debe,
        })),
      )
    } catch (e) {
      toast.error(`No se pudo exportar: ${(e as Error).message}`)
    }
  }

  return (
    <Dialog open={!!pedido} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{pedido?.titulo}</DialogTitle>
          <p className="text-sm text-muted-foreground">{pedido?.subtitulo}</p>
        </DialogHeader>

        {pedido && pedido.prorrateado !== 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
            De {pesos(pedido.monto)}, {pesos(pedido.prorrateado)} son administración (CECO 9xxx) repartida con los % de prorrateo: esa
            parte no tiene asientos propios. Abajo van los asientos directos ({pesos(pedido.monto - pedido.prorrateado)}).
          </div>
        )}
        {bal && pedido && !hayMas && asientos && (
          <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/40 p-2 text-center text-xs">
            <div>
              <p className="text-muted-foreground">Saldo inicial</p>
              <p className="font-semibold tabular-nums">{pesos(pedido.monto - movimientoMes)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Movimientos del mes</p>
              <p className="font-semibold tabular-nums">{pesos(movimientoMes)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Saldo al cierre</p>
              <p className="font-semibold tabular-nums">{pesos(pedido.monto)}</p>
            </div>
          </div>
        )}
        {hayMas && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
            Hay más de {MAX_ASIENTOS.toLocaleString('es-CL')} asientos: se muestran los primeros. Acota el periodo o la cuenta para verlos todos.
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          {error ? (
            <p className="p-4 text-sm text-destructive">{error}</p>
          ) : !asientos ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-6 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : lista.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{bal ? 'Sin movimientos en el mes: el saldo viene de meses anteriores.' : 'Sin asientos directos para esta cifra.'}</p>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Asiento</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Glosa</TableHead>
                  {varias && <TableHead>Cuenta</TableHead>}
                  <TableHead>CECO</TableHead>
                  {!bal && <TableHead>Tarea WIP</TableHead>}
                  <TableHead>Proyecto</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((a) => (
                  <TableRow key={`${a.trans_id}-${a.linea_id}`}>
                    <TableCell className="whitespace-nowrap">{formatFecha(a.fecha)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {a.numero}
                      {a.referencia && a.referencia !== String(a.numero) && <span className="block text-xs text-muted-foreground">Ref. {a.referencia}</span>}
                    </TableCell>
                    <TableCell className="max-w-[150px] text-xs">{TIPOS_TRANSACCION[a.tipo_trans] ?? `Tipo ${a.tipo_trans}`}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-xs" title={a.glosa ?? undefined}>{a.glosa}</TableCell>
                    {varias && (
                      <TableCell className="text-xs">
                        {cuentas.get(a.cuenta)?.codigo_formato} {cuentas.get(a.cuenta)?.nombre}
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap text-xs" title={cecos.get(a.ceco)?.nombre}>{a.ceco || '—'}</TableCell>
                    {!bal && <TableCell className="text-xs" title={dim2.get(a.dim2)}>{a.dim2 || '—'}</TableCell>}
                    <TableCell className="text-xs">{a.proyecto || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{a.debe ? formatCLP(a.debe) : ''}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{a.haber ? formatCLP(a.haber) : ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={(varias ? 8 : 7) - (bal ? 1 : 0)} className="font-semibold">
                    {lista.length.toLocaleString('es-CL')} líneas · {bal ? `movimiento ${pesos(movimientoMes)}` : `haber − debe ${pesos(totalHaber - totalDebe)}`}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{formatCLP(totalDebe)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{formatCLP(totalHaber)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={exportar} disabled={lista.length === 0}>
            <Download className="mr-1 h-4 w-4" /> Exportar a Excel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
