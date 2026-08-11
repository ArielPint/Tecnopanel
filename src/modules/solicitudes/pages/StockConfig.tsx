import { useState } from 'react'
import { Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import EmptyState from '@/modules/financiero/components/EmptyState'
import { useStock } from '../hooks/useStock'

export default function StockConfig() {
  const { stock, loading, uploading, error, lastResult, handleFile } = useStock()
  const [busqueda, setBusqueda] = useState('')

  const filtrado = stock.filter((s) => {
    const q = busqueda.toLowerCase()
    return !q || s.codigo.toLowerCase().includes(q) || s.descripcion.toLowerCase().includes(q)
  })

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrado.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs text-primary">{s.codigo}</TableCell>
                  <TableCell className="text-sm">{s.descripcion}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.unidad}</TableCell>
                  <TableCell className="text-right">{s.cantidad_disponible}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
