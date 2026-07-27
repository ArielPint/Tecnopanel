import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Package } from 'lucide-react'
import { Input } from '@/modules/financiero/components/ui/input'
import { Button } from '@/modules/financiero/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Badge } from '@/modules/financiero/components/ui/badge'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import { useAuth } from '../hooks/useAuth'
import { useCatalogoGD, type Producto } from '../hooks/useCatalogoGD'
import FormularioProductoGD from '../components/FormularioProductoGD'

const normCod = (c: string) => String(c || '').trim().toUpperCase()

export default function Catalogo() {
  const { perfil, isAdmin } = useAuth()
  const { allProducts, customCodes, pppMap, loading, error, guardar, ocultar } = useCatalogoGD()
  const [search, setSearch] = useState('')

  const filtrados = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return allProducts
    return allProducts.filter((p) => p.descripcion.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))
  }, [allProducts, search])

  const totales = useMemo(() => {
    const codes = new Set(filtrados.map((p) => normCod(p.codigo)))
    let monto = 0
    let conPrecio = 0
    for (const p of filtrados) {
      const ppp = pppMap[normCod(p.codigo)]
      if (ppp && ppp.cant > 0) conPrecio++
    }
    for (const [cod, v] of Object.entries(pppMap)) {
      if (codes.has(cod) && v.cant > 0) monto += v.monto
    }
    return { monto, conPrecio }
  }, [filtrados, pppMap])

  async function onOcultar(p: Producto) {
    if (!confirm(`¿Ocultar "${p.codigo}" del catálogo?`)) return
    try {
      await ocultar(p, perfil?.username ?? 'admin')
      toast.success('Producto ocultado del catálogo')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al ocultar')
    }
  }

  if (error) return <p className="text-destructive">{error}</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="🔍  Código o descripción…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-64" />
        <span className="ml-auto text-xs text-muted-foreground">
          {filtrados.length} producto{filtrados.length !== 1 ? 's' : ''} · {totales.conPrecio} con precio · {formatCLP(totales.monto)} comprado total
        </span>
        {isAdmin && (
          <FormularioProductoGD
            existentes={allProducts}
            onGuardar={(input) => guardar(input, perfil?.username ?? 'admin')}
          />
        )}
      </div>

      {!loading && filtrados.length === 0 ? (
        <EmptyState icon={Package} title="Ningún producto coincide con la búsqueda" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">Cant/Módulo</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead className="text-right">Presupuesto</TableHead>
                <TableHead className="text-right">PPP</TableHead>
                <TableHead>Fuente</TableHead>
                {isAdmin && <TableHead />}
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton columns={8 + (isAdmin ? 1 : 0)} />
            ) : (
              <TableBody>
                {filtrados.map((p) => {
                  const esCustom = customCodes.has(normCod(p.codigo))
                  const ppp = pppMap[normCod(p.codigo)]
                  const pppVal = ppp && ppp.cant > 0 ? ppp.monto / ppp.cant : null
                  return (
                    <TableRow key={p.codigo}>
                      <TableCell className="font-mono text-xs text-primary">{p.codigo}</TableCell>
                      <TableCell className="max-w-md truncate text-sm" title={p.descripcion}>{p.descripcion}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.unidad || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.cantidad_por_modulo != null ? p.cantidad_por_modulo.toLocaleString('es-CL', { maximumFractionDigits: 4 }) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.grupo || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums text-warning">{p.ppto != null && p.ppto > 0 ? formatCLP(p.ppto) : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums text-success">{pppVal != null ? formatCLP(pppVal) : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={esCustom ? 'secondary' : 'outline'}>{esCustom ? 'Custom' : 'Base'}</Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-2">
                            <FormularioProductoGD
                              producto={p}
                              existentes={allProducts}
                              onGuardar={(input) => guardar(input, perfil?.username ?? 'admin')}
                            />
                            <Button variant="outline" size="sm" onClick={() => onOcultar(p)}>✕</Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            )}
          </Table>
        </div>
      )}
    </div>
  )
}
