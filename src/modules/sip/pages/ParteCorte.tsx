import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Cargando } from '../components/comunes'
import { eliminarParteCorte, obtenerParteCorte, type LineaCorteV, type ParteCorteV } from '../lib/api'
import { fmtPesos, nombreCorte, resumirCortes } from '../lib/cortes'
import { fmtFecha, fmtFechaHora, fmtNum, fmtTramo } from '../lib/formato'
import { RUTA } from '../lib/rutas'
import { usePermisosSip } from '../hooks/usePermisosSip'

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{children}</p>
    </div>
  )
}

export default function ParteCorte() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede, userId } = usePermisosSip('cortes')
  const [parte, setParte] = useState<ParteCorteV | null>(null)
  const [lineas, setLineas] = useState<LineaCorteV[]>([])
  const [eliminando, setEliminando] = useState(false)

  useEffect(() => {
    obtenerParteCorte(id)
      .then(({ parte, lineas }) => {
        setParte(parte)
        setLineas(lineas)
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'No se pudo cargar')
        navigate(RUTA.cortes, { replace: true })
      })
  }, [id, navigate])

  if (!parte) return <Cargando />

  const puedeCorregir = puede('editar') || (puede('crear') && parte.created_by === userId)
  const r = resumirCortes(lineas)

  async function eliminar() {
    if (!window.confirm(`¿Eliminar el registro de corte N° ${parte!.numero}? Sus paneles vuelven al stock.`)) return
    setEliminando(true)
    try {
      await eliminarParteCorte(id)
      toast.success('Registro eliminado')
      navigate(RUTA.cortes, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
      setEliminando(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link to={RUTA.cortes} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Cortes de paneles
          </Link>
          <h1 className="mt-1 text-xl font-extrabold">
            Corte N° {parte.numero} · {fmtFecha(parte.fecha)}
          </h1>
          <p className="text-sm text-muted-foreground">{fmtTramo(parte.hora_desde, parte.hora_hasta)}</p>
        </div>
        <div className="flex gap-2">
          {puedeCorregir && (
            <Button asChild variant="outline" size="sm">
              <Link to={RUTA.editarCorte(id)}>
                <Pencil className="mr-1 h-4 w-4" /> Corregir
              </Link>
            </Button>
          )}
          {puede('eliminar') && (
            <Button variant="outline" size="sm" onClick={eliminar} disabled={eliminando} className="text-destructive hover:text-destructive">
              <Trash2 className="mr-1 h-4 w-4" /> Eliminar
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <Dato label="Paneles cortados">
            <span className="font-mono-tabular text-lg font-bold">{fmtNum(r.cortados)}</span> <span className="text-muted-foreground">· {fmtNum(r.m2, 1)} m²</span>
          </Dato>
          <Dato label="Rechazados">
            <span className="font-mono-tabular text-lg font-bold">{fmtNum(r.rechazados)}</span>
          </Dato>
          <Dato label="Maquila de corte">
            <span className="font-mono-tabular text-lg font-bold">{fmtPesos(r.costo)}</span>
          </Dato>
          <Dato label="Registrado por">
            {parte.registrado_por ?? '—'}
            <span className="block text-xs text-muted-foreground">{fmtFechaHora(parte.created_at)}</span>
          </Dato>
          {parte.updated_by && (
            <Dato label="Corregido por">
              {parte.corregido_por ?? '—'}
              <span className="block text-xs text-muted-foreground">{fmtFechaHora(parte.updated_at)}</span>
            </Dato>
          )}
          {parte.observacion && (
            <div className="sm:col-span-2 lg:col-span-4">
              <Dato label="Observación">{parte.observacion}</Dato>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Paneles</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proyecto / modelo</TableHead>
                <TableHead>Panel</TableHead>
                <TableHead>Corte</TableHead>
                <TableHead className="text-right">Cortados</TableHead>
                <TableHead className="text-right">Rech.</TableHead>
                <TableHead className="hidden text-right sm:table-cell">m²</TableHead>
                <TableHead className="hidden md:table-cell">OT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link to={RUTA.proyectoSap(l.proyecto_codigo)} className="font-semibold hover:underline">
                      {l.proyecto_nombre}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {l.proyecto_codigo} · {[l.modelo_vivienda, l.tipo_panel].filter(Boolean).join(' · ')}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono-tabular font-semibold">{l.panel_codigo}</div>
                    <div className="text-xs text-muted-foreground">{l.panel_descripcion}</div>
                  </TableCell>
                  <TableCell className="text-sm">{nombreCorte(l.corte_descripcion)}</TableCell>
                  <TableCell className="text-right font-mono-tabular font-semibold">{fmtNum(l.cortados)}</TableCell>
                  <TableCell className="text-right font-mono-tabular">{l.rechazados ? fmtNum(l.rechazados) : '—'}</TableCell>
                  <TableCell className="hidden text-right font-mono-tabular sm:table-cell">{fmtNum(l.cortados * l.m2_panel, 1)}</TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{l.referencia ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
