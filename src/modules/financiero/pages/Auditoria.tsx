import { useEffect, useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAudit } from '@/modules/financiero/hooks/useAudit'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import { formatFecha } from '@/modules/financiero/utils/formatters'

const TABLAS = [
  { value: 'financiero_presupuestos', label: 'Presupuestos' },
  { value: 'financiero_ordenes_compra', label: 'Órdenes de Compra' },
  { value: 'financiero_facturas', label: 'Facturas' },
  { value: 'financiero_remuneraciones', label: 'Remuneraciones' },
  { value: 'financiero_ingresos', label: 'Ingreso del Proyecto' },
  { value: 'financiero_gastos_directos', label: 'Gastos Directos' },
]

export default function Auditoria() {
  const [tablaAfectada, setTablaAfectada] = useState('')
  const { auditLog, loading, error } = useAudit({ tablaAfectada: tablaAfectada || undefined })
  const [usuarios, setUsuarios] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase
      .from('user_profiles')
      .select('id, name, username')
      .then(({ data }) => {
        const mapa: Record<string, string> = {}
        for (const u of data ?? []) mapa[u.id] = u.name || u.username
        setUsuarios(mapa)
      })
  }, [])

  const nombreTabla = useMemo(
    () => (tabla: string) => TABLAS.find((t) => t.value === tabla)?.label ?? tabla,
    [],
  )

  if (error) return <p className="text-destructive">{error}</p>

  return (
    <div className="space-y-4">
      <Select value={tablaAfectada || 'todas'} onValueChange={(v) => setTablaAfectada(v === 'todas' ? '' : v)}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Todas las tablas" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Todas las tablas</SelectItem>
          {TABLAS.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!loading && auditLog.length === 0 ? (
        <EmptyState icon={History} title="No hay movimientos para este filtro" />
      ) : (
        <div className="max-h-[70vh] overflow-y-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tabla</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton columns={5} rows={8} />
            ) : (
              <TableBody>
                {auditLog.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatFecha(entry.fecha)}</TableCell>
                    <TableCell>{nombreTabla(entry.tabla_afectada)}</TableCell>
                    <TableCell>
                      <Badge variant={entry.accion === 'INSERT' ? 'default' : 'secondary'}>{entry.accion}</Badge>
                    </TableCell>
                    <TableCell>{(entry.usuario_id && usuarios[entry.usuario_id]) ?? '—'}</TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            Ver cambios
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>
                              {nombreTabla(entry.tabla_afectada)} — {entry.accion}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">Antes</p>
                              <pre className="max-h-96 overflow-auto rounded-md border bg-muted p-2 text-xs">
                                {entry.datos_previos ? JSON.stringify(entry.datos_previos, null, 2) : '(nuevo registro)'}
                              </pre>
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-medium text-muted-foreground">Después</p>
                              <pre className="max-h-96 overflow-auto rounded-md border bg-muted p-2 text-xs">
                                {JSON.stringify(entry.datos_nuevos, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
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
