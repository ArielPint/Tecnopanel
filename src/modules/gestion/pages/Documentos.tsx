import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { ProyectoObra } from '@/hooks/useAccesoUsuario'
import { supabase } from '@/lib/supabaseClient'
import { useDocumentos, type DocumentoItem } from '../hooks/useDocumentos'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Contexto = { tipo: 'crm' } | { tipo: 'proyecto'; proyectoId: string }

async function abrirDocumento(doc: DocumentoItem) {
  if (doc.apertura.tipo === 'link') {
    window.open(doc.apertura.ref, '_blank')
    return
  }
  const { data, error } = await supabase.storage.from(doc.apertura.bucket).createSignedUrl(doc.apertura.ref, 3600)
  if (error || !data?.signedUrl) return
  window.open(data.signedUrl, '_blank')
}

export default function Documentos({ proyectosObra, tieneCrm }: { proyectosObra: ProyectoObra[]; tieneCrm: boolean }) {
  const [seleccion, setSeleccion] = useState<string | null>(null)

  useEffect(() => {
    if (seleccion) return
    if (tieneCrm) setSeleccion('crm')
    else if (proyectosObra.length > 0) setSeleccion(proyectosObra[0].id)
  }, [tieneCrm, proyectosObra, seleccion])

  const contexto: Contexto | null =
    seleccion === 'crm' ? { tipo: 'crm' } : seleccion ? { tipo: 'proyecto', proyectoId: seleccion } : null

  const { documentos, loading, error } = useDocumentos(contexto)

  if (!tieneCrm && proyectosObra.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        Sin documentos disponibles para tu acceso actual.
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
          Error al cargar documentos: {error}
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          <p className="mb-3 text-sm font-bold">Documentos</p>
          {loading ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : documentos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin documentos en este contexto.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Abrir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentos.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.nombre}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{d.fuente}</Badge>
                    </TableCell>
                    <TableCell>{d.fecha ? new Date(d.fecha).toLocaleDateString('es-CL') : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => abrirDocumento(d)}>
                        <ExternalLink size={14} />
                      </Button>
                    </TableCell>
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
