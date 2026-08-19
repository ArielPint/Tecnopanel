import { useState } from 'react'
import { Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import EmptyState from '@/modules/financiero/components/EmptyState'
import { useStock } from '../hooks/useStock'
import { useCatalogoGD } from '@/modules/logistica/hooks/useCatalogoGD'
import { normCod } from '@/modules/logistica/lib/calc'

function observacion(equivMod: number | null): { label: string; className: string; rank: number } | null {
  if (equivMod == null) return null
  if (equivMod < 15) return { label: 'Stock Crítico', className: 'text-destructive', rank: 0 }
  if (equivMod < 25) return { label: 'Stock Medio', className: 'text-warning', rank: 1 }
  return { label: 'Stock Bueno', className: 'text-success', rank: 2 }
}

export default function StockConfig() {
  const { stock, loading, uploading, error, lastResult, handleFile } = useStock()
  const { allProducts } = useCatalogoGD()
  const [busqueda, setBusqueda] = useState('')
  const [obsDir, setObsDir] = useState<1 | -1 | null>(null)

  const cpmPorCodigo = new Map(allProducts.map((p) => [normCod(p.codigo), p.cantidad_por_modulo]))

  const filtrado = stock
    .filter((s) => {
      const q = busqueda.toLowerCase()
      return !q || s.codigo.toLowerCase().includes(q) || s.descripcion.toLowerCase().includes(q)
    })
    .map((s) => {
      const cpm = cpmPorCodigo.get(normCod(s.codigo)) ?? null
      const equivMod = cpm ? s.cantidad_disponible / cpm : null
      return { ...s, equivMod, obs: observacion(equivMod) }
    })

  if (obsDir != null) {
    filtrado.sort((a, b) => ((a.obs?.rank ?? 3) - (b.obs?.rank ?? 3)) * obsDir)
  }

  function toggleObsSort() {
    setObsDir((d) => (d === null ? 1 : d === 1 ? -1 : null))
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>📦 Stock de productos</CardTitle>
          <CardDescription>
            Sube el Excel de stock (columnas: código, descripción, unidad, cantidad). Cada carga reemplaza la cantidad disponible por código.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <p className="text-xs text-destructive">{error}</p>}
          {lastResult && !error && (
            <p className="text-xs text-success">
              {lastResult.nuevos} producto(s) nuevo(s), {lastResult.actualizados} actualizado(s).
            </p>
          )}
          <Button asChild disabled={uploading}>
            <label className="cursor-pointer">
              {uploading ? 'Procesando…' : 'Subir archivo .xlsx'}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                  e.target.value = ''
                }}
              />
            </label>
          </Button>
        </CardContent>
      </Card>

      <Input placeholder="🔍 Buscar por código o descripción…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="h-9 max-w-xs" />

      {!loading && filtrado.length === 0 ? (
        <EmptyState icon={Package} title="Sin stock cargado todavía" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Equiv. Módulos</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={toggleObsSort}>
                  Observación{obsDir === 1 ? ' ▲' : obsDir === -1 ? ' ▼' : ''}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrado.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs text-primary">{s.codigo}</TableCell>
                  <TableCell className="text-sm">{s.descripcion}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.unidad}</TableCell>
                  <TableCell className="text-right">{s.cantidad_disponible}</TableCell>
                  <TableCell className="text-right">{s.equivMod != null ? s.equivMod.toFixed(2) : '—'}</TableCell>
                  <TableCell className={s.obs ? `text-xs font-semibold ${s.obs.className}` : 'text-xs text-muted-foreground'}>
                    {s.obs?.label ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
