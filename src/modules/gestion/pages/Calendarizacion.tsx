import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ProyectoObra } from '@/hooks/useAccesoUsuario'
import { useProximosVencimientos } from '../hooks/useProximosVencimientos'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Contexto = { tipo: 'crm' } | { tipo: 'proyecto'; proyectoId: string; proyectoSlug: string }

export default function Calendarizacion({ proyectosObra, tieneCrm }: { proyectosObra: ProyectoObra[]; tieneCrm: boolean }) {
  const [seleccion, setSeleccion] = useState<string | null>(null)

  useEffect(() => {
    if (seleccion) return
    if (tieneCrm) setSeleccion('crm')
    else if (proyectosObra.length > 0) setSeleccion(proyectosObra[0].id)
  }, [tieneCrm, proyectosObra, seleccion])

  const contexto: Contexto | null =
    seleccion === 'crm'
      ? { tipo: 'crm' }
      : seleccion
        ? (() => {
            const p = proyectosObra.find((x) => x.id === seleccion)
            return p ? { tipo: 'proyecto', proyectoId: p.id, proyectoSlug: p.slug } : null
          })()
        : null

  const { vencimientos, loading, error } = useProximosVencimientos(contexto)

  if (!tieneCrm && proyectosObra.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Sin vencimientos disponibles para tu acceso actual.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1.5 sm:w-72">
        <Select value={seleccion ?? undefined} onValueChange={setSeleccion}>
          <SelectTrigger>
            <SelectValue placeholder="Elegir contexto" />
          </SelectTrigger>
          <SelectContent>
            {tieneCrm && <SelectItem value="crm">CRM</SelectItem>}
            {proyectosObra.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Error al cargar vencimientos: {error}
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          <p className="mb-3 text-sm font-bold">Próximos vencimientos (90 días)</p>
          {loading ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : vencimientos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin vencimientos en los próximos 90 días.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead>Descripción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vencimientos.map((v, i) => (
                  <TableRow key={i}>
                    <TableCell>{new Date(v.fecha).toLocaleDateString('es-CL')}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{v.fuente}</Badge>
                    </TableCell>
                    <TableCell>{v.ruta ? <Link to={v.ruta} className="text-brand hover:underline">{v.descripcion}</Link> : v.descripcion}</TableCell>
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
