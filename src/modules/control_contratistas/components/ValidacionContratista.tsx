import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import MontoInput from '@/components/MontoInput'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import DetalleEstadoPago from '@/modules/estados_pago/components/DetalleEstadoPago'
import { AuthProviderSubcontratista } from '@/modules/estados_pago/hooks/useAuth'
import { ESTADO_LABEL, ESTADO_VARIANT } from '@/modules/estados_pago/lib/estadosFlujo'
import { usePermisosContratistas } from '../hooks/usePermisosContratistas'
import { DOCS_EMPRESA } from '../lib/catalogos'
import {
  cambiarEstadoEp,
  confirmarListado,
  eliminarDocEmpresa,
  revisarDocEmpresa,
  revisarListado,
  subirDocEmpresa,
  type DocEmpresa,
  type Empresa,
  type EstadoPagoEmpresa,
  type Listado,
} from '../lib/api'
import { nombreMes, periodoDe } from '../lib/contratistas'
import { RUTA } from '../lib/rutas'
import { CeldaDoc, CeldaListado } from './DocsEmpresa'

// Validación en Control de Contratistas: la documentación del mes de una
// empresa (con su revisión) y la tabla de estados de pago con los cambios de estado según el rol.

const msg = (err: unknown, porDefecto: string) => (err instanceof Error ? err.message : porDefecto)

/** Ejecuta una acción con aviso y recarga; la usan las dos piezas de este archivo. */
export function useAccion(recargar: () => Promise<void>) {
  const [ocupado, setOcupado] = useState(false)
  async function hacer(accion: () => Promise<unknown>, exito: string) {
    setOcupado(true)
    try {
      await accion()
      toast.success(exito)
      await recargar()
      return true
    } catch (err) {
      toast.error(msg(err, 'No se pudo completar la acción'))
      return false
    } finally {
      setOcupado(false)
    }
  }
  return { ocupado, hacer }
}

/** Documentación y listado de una empresa en un mes, con aprobar/rechazar para quien revisa. */
export function MesEmpresa({
  empresa,
  periodo,
  docs,
  listado,
  activos,
  recargar,
}: {
  empresa: Empresa
  periodo: string
  docs: DocEmpresa[]
  listado: Listado | undefined
  activos?: number
  recargar: () => Promise<void>
}) {
  const { userId, revisaDocs } = usePermisosContratistas()
  const { ocupado, hacer } = useAccion(recargar)
  const confirma = revisaDocs

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <CeldaListado
        periodo={periodo}
        listado={listado}
        activos={activos}
        puedeConfirmar={confirma && empresa.activa && periodo <= periodoDe()}
        ocupado={ocupado}
        onConfirmar={() =>
          window.confirm(`¿Confirmar el listado de ${nombreMes(periodo)} por ${empresa.nombre}? Queda la foto de sus trabajadores activos.`) &&
          hacer(() => confirmarListado(periodo, empresa.id), 'Listado confirmado')
        }
        onRevisar={revisaDocs ? (ap, m) => hacer(() => revisarListado(empresa.id, periodo, ap, m), ap ? 'Listado aprobado' : 'Listado rechazado') : undefined}
      />
      {DOCS_EMPRESA.map((t) => (
        <CeldaDoc
          key={t.key}
          titulo={t.label}
          archivos={docs.filter((d) => d.tipo === t.key)}
          puedeSubir={empresa.activa}
          puedeBorrar={(d) => revisaDocs || (d.subido_por === userId && d.estado !== 'aprobado')}
          ocupado={ocupado}
          onSubir={(f) => hacer(() => subirDocEmpresa(empresa.id, periodo, t.key, f), 'Documento cargado')}
          onBorrar={(d) => window.confirm(`¿Eliminar "${d.nombre}"?`) && hacer(() => eliminarDocEmpresa(d), 'Documento eliminado')}
          onRevisar={revisaDocs ? (d, ap, m) => hacer(() => revisarDocEmpresa(d.id, ap, m), ap ? 'Documento aprobado' : 'Documento rechazado') : undefined}
        />
      ))}
    </div>
  )
}

type Dialogo = { ep: EstadoPagoEmpresa; tipo: 'rechazar' | 'pagar' } | null

/** Estados de pago con sus acciones: revisor (a revisión, rechazar) y aprobador (aprobar, pagar). */
export function TablaEstadosPago({
  eps,
  nombreEmpresa,
  recargar,
}: {
  eps: EstadoPagoEmpresa[]
  /** si se indica, se muestra la columna Empresa (con enlace a su ficha) */
  nombreEmpresa?: (id: string) => string
  recargar: () => Promise<void>
}) {
  const { tiene } = usePermisosContratistas()
  const revisor = tiene('revisor_ep') || tiene('aprobador_ep')
  const aprobador = tiene('aprobador_ep')
  const { ocupado, hacer } = useAccion(recargar)
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const sinPermiso = async () => {
    throw new Error('Usa los botones de la tabla')
  }

  if (eps.length === 0) return <p className="text-sm text-muted-foreground">No hay estados de pago.</p>

  return (
    <AuthProviderSubcontratista esSubcontratista={false}>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-semibold">N° EP</th>
              {nombreEmpresa && <th className="px-3 py-2 font-semibold">Empresa</th>}
              <th className="px-3 py-2 font-semibold">Proyecto · subcontrato</th>
              <th className="px-3 py-2 font-semibold">Período</th>
              <th className="px-3 py-2 text-right font-semibold">Neto</th>
              <th className="px-3 py-2 text-right font-semibold">Saldo</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {eps.map((ep) => (
              <tr key={ep.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{ep.numero_ep}</td>
                {nombreEmpresa && (
                  <td className="px-3 py-2">
                    <Link to={RUTA.contratista(ep.empresa_id)} className="font-medium text-brand hover:underline">
                      {nombreEmpresa(ep.empresa_id)}
                    </Link>
                  </td>
                )}
                <td className="px-3 py-2">
                  <p>{ep.proyecto_nombre}</p>
                  <p className="text-xs text-muted-foreground">{ep.especialidad}</p>
                </td>
                <td className="px-3 py-2">{ep.periodo ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCLP(ep.monto_neto)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCLP(ep.saldo_pendiente)}</td>
                <td className="px-3 py-2">
                  <Badge variant={ESTADO_VARIANT[ep.estado]}>{ESTADO_LABEL[ep.estado]}</Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {ep.estado === 'emitido' && revisor && (
                      <Button size="sm" variant="outline" className="h-8 text-xs" disabled={ocupado} onClick={() => hacer(() => cambiarEstadoEp(ep.id, 'en_revision'), 'EP en revisión')}>
                        Pasar a revisión
                      </Button>
                    )}
                    {ep.estado === 'en_revision' && aprobador && (
                      <Button size="sm" className="h-8 text-xs" disabled={ocupado} onClick={() => hacer(() => cambiarEstadoEp(ep.id, 'aprobado'), 'EP aprobado')}>
                        Aprobar
                      </Button>
                    )}
                    {ep.estado === 'en_revision' && revisor && (
                      <Button size="sm" variant="outline" className="h-8 text-xs text-destructive" disabled={ocupado} onClick={() => setDialogo({ ep, tipo: 'rechazar' })}>
                        Rechazar
                      </Button>
                    )}
                    {ep.estado === 'aprobado' && aprobador && (
                      <Button size="sm" variant="outline" className="h-8 text-xs" disabled={ocupado} onClick={() => setDialogo({ ep, tipo: 'pagar' })}>
                        Registrar pago
                      </Button>
                    )}
                    <DetalleEstadoPago
                      estadoPago={ep}
                      subcontratoLabel={`${ep.proyecto_nombre} · ${ep.especialidad}`}
                      onCambiarEstado={sinPermiso}
                      onRegistrarPago={sinPermiso}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dialogo && (
        <DialogoEp
          dialogo={dialogo}
          ocupado={ocupado}
          onCerrar={() => setDialogo(null)}
          onAceptar={async (texto, monto) => {
            const ok =
              dialogo.tipo === 'rechazar'
                ? await hacer(() => cambiarEstadoEp(dialogo.ep.id, 'rechazado', texto), 'EP rechazado')
                : await hacer(() => cambiarEstadoEp(dialogo.ep.id, 'pagado', texto || undefined, monto), 'Pago registrado')
            if (ok) setDialogo(null)
          }}
        />
      )}
    </AuthProviderSubcontratista>
  )
}

function DialogoEp({
  dialogo,
  ocupado,
  onCerrar,
  onAceptar,
}: {
  dialogo: NonNullable<Dialogo>
  ocupado: boolean
  onCerrar: () => void
  onAceptar: (texto: string, monto?: number) => void
}) {
  const { ep, tipo } = dialogo
  const [texto, setTexto] = useState('')
  const [monto, setMonto] = useState<number | null>(Number(ep.monto_neto))
  const rechazar = tipo === 'rechazar'

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {rechazar ? 'Rechazar' : 'Registrar el pago del'} EP N° {ep.numero_ep}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            if (rechazar && !texto.trim()) return
            if (!rechazar && (monto == null || monto < 0)) return
            onAceptar(texto.trim(), monto ?? undefined)
          }}
        >
          <p className="text-sm text-muted-foreground">
            {ep.proyecto_nombre} · {ep.especialidad} · neto {formatCLP(ep.monto_neto)}. Se avisa por correo a la empresa.
          </p>
          {!rechazar && (
            <div className="space-y-1">
              <Label htmlFor="ep-monto">Monto pagado ($)</Label>
              <MontoInput id="ep-monto" value={monto} onChange={setMonto} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono-tabular" />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="ep-texto">{rechazar ? 'Motivo del rechazo' : 'Comentario (opcional)'}</Label>
            <Textarea id="ep-texto" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" variant={rechazar ? 'destructive' : 'default'} disabled={ocupado || (rechazar && !texto.trim())}>
              {rechazar ? 'Rechazar' : 'Registrar pago'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

