import { useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Boxes } from 'lucide-react'
import { Button } from '@/modules/financiero/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Badge } from '@/modules/financiero/components/ui/badge'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import { useAuth } from '../hooks/useAuth'
import { useCatalogoGD } from '../hooks/useCatalogoGD'
import { useIngresoStock } from '../hooks/useIngresoStock'
import FormularioStockItem from '../components/FormularioStockItem'
import { normCod } from '../lib/calc'

function alcance(stock: number, qty: number | null) {
  if (qty == null || qty <= 0) return null
  return stock / qty
}

function AlcanceBadge({ stock, qty }: { stock: number; qty: number | null }) {
  const alc = alcance(stock, qty)
  if (alc == null) return <Badge variant="outline">Sin ref.</Badge>
  if (alc < 5) return <Badge variant="destructive">Crítico · {alc.toFixed(1)} mód</Badge>
  if (alc < 15) return <Badge className="bg-warning text-warning-foreground">Bajo · {alc.toFixed(1)} mód</Badge>
  return <Badge className="bg-success text-success-foreground">OK · {alc.toFixed(1)} mód</Badge>
}

export default function StockIngreso() {
  const { perfil } = useAuth()
  const { allProducts, loading: catalogLoading } = useCatalogoGD()
  const stock = useIngresoStock(allProducts)

  useEffect(() => {
    if (stock.error) toast.error(stock.error)
  }, [stock.error])

  const disponibles = useMemo(() => {
    const usados = new Set(stock.items.map((i) => normCod(i.codigo)))
    return allProducts.filter((p) => !usados.has(normCod(p.codigo)))
  }, [allProducts, stock.items])

  const kpis = useMemo(() => {
    let critico = 0
    let bajo = 0
    let ok = 0
    let sinRef = 0
    for (const it of stock.items) {
      const alc = alcance(it.stockFisico, it.qty)
      if (alc == null) sinRef++
      else if (alc < 5) critico++
      else if (alc < 15) bajo++
      else ok++
    }
    return { total: stock.items.length, critico, bajo, ok, sinRef }
  }, [stock.items])

  async function onGuardarTodo() {
    try {
      const total = stock.items.length
      await stock.guardarTodo(perfil?.username ?? perfil?.name ?? 'sistema')
      toast.success(`${total} materiales guardados`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    }
  }

  async function onRemove(idx: number) {
    try {
      await stock.removeItem(idx)
      toast.success('Material eliminado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  const loading = catalogLoading || stock.loading

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Semana:</span>
        <Button variant="outline" size="sm" onClick={stock.goPrev}>◀</Button>
        <Select value={stock.semanaKey} onValueChange={stock.setSemana}>
          <SelectTrigger className="h-9 w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {stock.semanas.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={stock.goNext}>▶</Button>
        <Button variant="outline" size="sm" onClick={stock.goHoy} className="text-primary">
          Actual
        </Button>
        <Button onClick={onGuardarTodo} disabled={stock.saving || !stock.items.length} className="ml-auto">
          {stock.saving ? 'Guardando…' : '💾 Guardar semana'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="rounded-md border bg-card px-4 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">Materiales</div>
          <div className="text-lg font-bold">{kpis.total}</div>
        </div>
        <div className="rounded-md border bg-card px-4 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">Crítico (&lt;5 mód)</div>
          <div className="text-lg font-bold text-destructive">{kpis.critico}</div>
        </div>
        <div className="rounded-md border bg-card px-4 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">Bajo (5-14 mód)</div>
          <div className="text-lg font-bold text-warning">{kpis.bajo}</div>
        </div>
        <div className="rounded-md border bg-card px-4 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">OK (≥15 mód)</div>
          <div className="text-lg font-bold text-success">{kpis.ok}</div>
        </div>
        <div className="ml-auto rounded-md border bg-card px-4 py-2">
          <div className="text-[10px] uppercase text-muted-foreground">Sin cant. por módulo</div>
          <div className="text-lg font-bold text-muted-foreground">{kpis.sinRef}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">📦 Stock de la semana</h3>
        <FormularioStockItem productosDisponibles={disponibles} onGuardar={({ producto, stockFisico }) => stock.agregar(producto!, stockFisico)} />
      </div>

      {!loading && stock.items.length === 0 ? (
        <EmptyState icon={Boxes} title="Sin materiales — usá + Agregar material para comenzar" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">Stock físico</TableHead>
                <TableHead className="text-right">Cant/Módulo</TableHead>
                <TableHead>Alcance</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton columns={7} />
            ) : (
              <TableBody>
                {stock.items.map((it, idx) => (
                  <TableRow key={it.codigo}>
                    <TableCell className="font-mono text-xs text-primary">{it.codigo}</TableCell>
                    <TableCell className="max-w-md truncate text-sm" title={it.material}>
                      {it.material}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{it.unidad}</TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${it.dirty ? 'text-warning' : ''}`}>
                      {it.stockFisico.toLocaleString('es-CL', { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {it.qty != null ? it.qty.toLocaleString('es-CL', { maximumFractionDigits: 4 }) : '—'}
                    </TableCell>
                    <TableCell>
                      <AlcanceBadge stock={it.stockFisico} qty={it.qty} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <FormularioStockItem item={it} productosDisponibles={disponibles} onGuardar={({ stockFisico }) => stock.editar(idx, stockFisico)} />
                        <Button variant="ghost" size="icon" onClick={() => onRemove(idx)} title="Quitar">
                          ✕
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </div>
      )}
    </div>
  )
}
