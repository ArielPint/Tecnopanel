import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Cargando } from '../components/comunes'
import { eliminarParte, listarConsumosParte, obtenerParte, type ConsumoV, type LineaV, type ParteV } from '../lib/api'
import { consumoPorMaterial, resumir } from '../lib/calculo'
import { fmtCant, fmtFecha, fmtFechaHora, fmtNum, fmtTramo } from '../lib/formato'
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

export default function Parte() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede, puedeEn, userId } = usePermisosSip('produccion')
  const [parte, setParte] = useState<ParteV | null>(null)
  const [lineas, setLineas] = useState<LineaV[]>([])
  const [consumos, setConsumos] = useState<ConsumoV[]>([])
  const [eliminando, setEliminando] = useState(false)

  useEffect(() => {
    Promise.all([obtenerParte(id), listarConsumosParte(id)])
      .then(([{ parte, lineas }, c]) => {
        setParte(parte)
        setLineas(lineas)
        setConsumos(c)
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'No se pudo cargar')
        navigate(RUTA.registro, { replace: true })
      })
  }, [id, navigate])

  if (!parte) return <Cargando />

  const puedeCorregir = puede('editar') || (puede('crear') && parte.created_by === userId)
  const r = resumir(lineas)
  const materiales = consumoPorMaterial(consumos)

  async function eliminar() {
    if (!window.confirm(`¿Eliminar el registro N° ${parte!.numero}? Se borran sus paneles y su consumo de materiales.`)) return
    setEliminando(true)
    try {
      await eliminarParte(id)
      toast.success('Registro eliminado')
      navigate(RUTA.registro, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
      setEliminando(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link to={RUTA.registro} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Registro de producción
          </Link>
          <h1 className="mt-1 text-xl font-extrabold">
            Registro N° {parte.numero} · {fmtFecha(parte.fecha)}
          </h1>
          <p className="text-sm text-muted-foreground">{fmtTramo(parte.hora_desde, parte.hora_hasta)}</p>
        </div>
        <div className="flex gap-2">
          {puedeCorregir && (
            <Button asChild variant="outline" size="sm">
              <Link to={RUTA.editarParte(id)}>
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
          <Dato label="Paneles buenos">
            <span className="font-mono-tabular text-lg font-bold">{fmtNum(r.buenos)}</span> <span className="text-muted-foreground">· {fmtNum(r.m2, 1)} m²</span>
          </Dato>
          <Dato label="Rechazados">
            <span className="font-mono-tabular text-lg font-bold">{fmtNum(r.rechazados)}</span>
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
                <TableHead>Panel</TableHead>
                <TableHead className="text-right">Buenos</TableHead>
                <TableHead className="text-right">Rech.</TableHead>
                <TableHead className="hidden text-right sm:table-cell">m²</TableHead>
                <TableHead>Proyecto / OT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <div className="font-mono-tabular font-semibold">{l.panel_codigo}</div>
                    <div className="text-xs text-muted-foreground">{l.panel_descripcion}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono-tabular font-semibold">{fmtNum(l.buenos)}</TableCell>
                  <TableCell className="text-right font-mono-tabular">{l.rechazados ? fmtNum(l.rechazados) : '—'}</TableCell>
                  <TableCell className="hidden text-right font-mono-tabular sm:table-cell">{fmtNum(l.buenos * l.m2_panel, 1)}</TableCell>
                  <TableCell className="text-sm">{[l.proyecto_nombre, l.referencia].filter(Boolean).join(' · ') || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Consumo de materiales</CardTitle>
          <p className="text-xs text-muted-foreground">
            Con la receta que tenía cada panel al registrarlo{puedeEn('consumo') ? '. El total por período está en Consumo de materiales.' : '.'}
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Buenos</TableHead>
                <TableHead className="text-right">Merma</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Unidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materiales.map((m) => (
                <TableRow key={m.material_id}>
                  <TableCell>
                    <span className="font-mono-tabular text-xs text-muted-foreground">{m.codigo}</span> {m.descripcion}
                  </TableCell>
                  <TableCell className="text-right font-mono-tabular">{fmtCant(m.buenos)}</TableCell>
                  <TableCell className="text-right font-mono-tabular">{m.merma ? fmtCant(m.merma) : '—'}</TableCell>
                  <TableCell className="text-right font-mono-tabular font-semibold">{fmtCant(m.total)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.unidad}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {materiales.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="text-xs font-normal text-muted-foreground">
                    Merma = material de los paneles rechazados.
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
