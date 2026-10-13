import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Cargando, Vacio } from '../components/comunes'
import { listarItemsSap, listarProyectosSap, type ItemSap, type ProyectoSap } from '../lib/api'
import { avancePorProyecto, fmtPesos } from '../lib/cortes'
import { fmtFechaHora, fmtNum, fmtPct } from '../lib/formato'
import { RUTA } from '../lib/rutas'

export function BarraAvance({ valor }: { valor: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
      <div className="h-full rounded bg-brand" style={{ width: `${Math.min(100, Math.max(0, valor * 100))}%` }} />
    </div>
  )
}

/** Proyectos de SAP con cortes: lo planificado en la estructura de proyecto contra lo cortado. */
export default function ProyectosSap() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ItemSap[]>([])
  const [proyectos, setProyectos] = useState<ProyectoSap[]>([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)

  useEffect(() => {
    Promise.all([listarItemsSap(), listarProyectosSap()])
      .then(([i, p]) => {
        setItems(i)
        setProyectos(p)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  const avance = useMemo(() => avancePorProyecto(items), [items])
  const filtrados = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return avance.filter((p) => (verInactivos || p.activo) && (!q || `${p.codigo} ${p.nombre} ${p.cliente ?? ''}`.toLowerCase().includes(q)))
  }, [avance, texto, verInactivos])

  const ultimaSync = proyectos.reduce<string | null>((m, p) => (!m || p.sincronizado_at > m ? p.sincronizado_at : m), null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar proyecto, código o cliente" value={texto} onChange={(e) => setTexto(e.target.value)} className="pl-8" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={verInactivos} onCheckedChange={(v) => setVerInactivos(v === true)} />
          Ver también los cerrados en SAP
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Proyectos con Cubicación liberada o planificada en SAP. Última sincronización: {ultimaSync ? fmtFechaHora(ultimaSync) : '—'}.
      </p>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <Cargando />
          ) : filtrados.length === 0 ? (
            <Vacio>{avance.length === 0 ? 'Aún no se han sincronizado proyectos desde SAP.' : 'Ningún proyecto coincide con la búsqueda.'}</Vacio>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proyecto</TableHead>
                    <TableHead className="text-right">Paneles SAP</TableHead>
                    <TableHead className="text-right">Cortados</TableHead>
                    <TableHead className="w-40">Avance</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Maquila plan.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map((p) => {
                    const av = p.plan ? p.cortados / p.plan : 0
                    return (
                      <TableRow key={p.codigo} className="cursor-pointer" onClick={() => navigate(RUTA.proyectoSap(p.codigo))}>
                        <TableCell>
                          <div className="font-semibold">
                            {p.nombre} {!p.activo && <Badge variant="secondary">Cerrado</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {p.codigo}
                            {p.of_numero && ` · OF ${p.of_numero}`}
                            {p.cliente && ` · ${p.cliente}`}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono-tabular">{fmtNum(p.plan, 1)}</TableCell>
                        <TableCell className="text-right font-mono-tabular font-semibold">{fmtNum(p.cortados)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <BarraAvance valor={av} />
                            <span className="w-12 text-right font-mono-tabular text-xs">{fmtPct(av)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-right font-mono-tabular md:table-cell">{fmtPesos(p.costoPlan)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
