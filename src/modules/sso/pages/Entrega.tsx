import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import {
  CATEGORIAS_EPP,
  MOTIVO_LABEL,
  eliminarEntrega,
  listarCatalogoEpp,
  listarItems,
  obtenerEntrega,
  urlComprobante,
  type ElementoEpp,
  type EntregaV,
  type ItemEntrega,
} from '../lib/apiEpp'
import { obtenerTrabajador } from '../lib/apiTrabajadores'
import { fmtFecha } from '../lib/estados'
import { formatearRut } from '../lib/rut'
import { RUTA } from '../lib/rutas'
import type { TrabajadorV } from '../lib/tiposTrabajadores'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'

const CATEGORIA = Object.fromEntries(CATEGORIAS_EPP.map((c) => [c.key, c.label])) as Record<string, string>

function sumarMeses(fecha: string, meses: number) {
  return new Date(Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1 + meses, +fecha.slice(8, 10))).toISOString().slice(0, 10)
}

export default function Entrega() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede, userId } = usePermisosSso('epp')
  const { nombreUsuario } = useDatosSso()
  const [e, setE] = useState<EntregaV | null>(null)
  const [t, setT] = useState<TrabajadorV | null>(null)
  const [items, setItems] = useState<ItemEntrega[]>([])
  const [catalogo, setCatalogo] = useState<ElementoEpp[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([obtenerEntrega(id), listarItems([id]), listarCatalogoEpp()])
      .then(async ([ent, its, cat]) => {
        setE(ent)
        setItems(its)
        setCatalogo(cat)
        if (ent) setT(await obtenerTrabajador(ent.trabajador_id))
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />
  if (!e) {
    return (
      <div className="space-y-3">
        <Link to={RUTA.epp} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a entregas
        </Link>
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">La entrega no existe o no tienes acceso.</p>
      </div>
    )
  }
  const ent = e
  const cat = new Map(catalogo.map((c) => [c.id, c]))
  const puedeEditar = puede('editar') || (ent.entregado_por === userId && puede('crear'))

  async function verComprobante() {
    try {
      window.open(await urlComprobante(ent.comprobante_path!), '_blank')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo abrir el comprobante')
    }
  }

  async function borrar() {
    if (!window.confirm(`¿Eliminar la entrega del ${fmtFecha(ent.fecha)}? Cambia las fechas de reposición del trabajador.`)) return
    try {
      await eliminarEntrega(ent)
      toast.success('Entrega eliminada')
      navigate(RUTA.epp, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <div className="space-y-4">
      <Link to={RUTA.epp} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a entregas
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold">Entrega de EPP · {fmtFecha(ent.fecha)}</h1>
          <p className="text-sm text-muted-foreground">
            {MOTIVO_LABEL[ent.motivo]} · registró {nombreUsuario(ent.entregado_por)}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          {ent.comprobante_path && (
            <Button size="sm" variant="outline" onClick={verComprobante}>
              <FileText className="mr-1 h-4 w-4" /> Comprobante
            </Button>
          )}
          {puedeEditar && (
            <Button size="sm" variant="outline" onClick={() => navigate(RUTA.editarEntrega(ent.id))}>
              <Pencil className="mr-1 h-4 w-4" /> Editar
            </Button>
          )}
          {puede('eliminar') && (
            <Button size="sm" variant="outline" className="text-destructive" onClick={borrar}>
              <Trash2 className="mr-1 h-4 w-4" /> Eliminar
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-1 pt-5 text-sm">
          {t ? (
            <>
              <Link to={RUTA.trabajador(t.id)} className="text-base font-semibold hover:underline">
                {t.apellidos}, {t.nombres}
              </Link>
              <p className="text-muted-foreground">
                {formatearRut(t.rut)} · {t.cargo ?? 'sin cargo'} · {t.empresa}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Trabajador no disponible.</p>
          )}
          {ent.observaciones && <p className="whitespace-pre-wrap pt-2">{ent.observaciones}</p>}
          {!ent.comprobante_path && <p className="pt-2 text-xs text-amber-700 dark:text-amber-400">Falta adjuntar el comprobante firmado por el trabajador.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Elemento</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Talla</TableHead>
                <TableHead>Reposición</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => {
                const c = cat.get(i.epp_id)
                return (
                  <TableRow key={i.epp_id}>
                    <TableCell className="font-medium">{c?.nombre ?? '—'}</TableCell>
                    <TableCell>{c ? CATEGORIA[c.categoria] : '—'}</TableCell>
                    <TableCell className="text-right font-mono-tabular">{i.cantidad}</TableCell>
                    <TableCell>{i.talla ?? '—'}</TableCell>
                    <TableCell>{c?.vida_util_meses ? fmtFecha(sumarMeses(ent.fecha, c.vida_util_meses)) : 'Por deterioro'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
