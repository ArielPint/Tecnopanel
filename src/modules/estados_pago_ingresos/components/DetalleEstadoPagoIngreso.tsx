import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileText, Trash2 } from 'lucide-react'
import { Button } from '@/modules/financiero/components/ui/button'
import { Badge } from '@/modules/financiero/components/ui/badge'
import MontoInput from '@/components/MontoInput'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import { formatCLP, formatFecha } from '@/modules/financiero/utils/formatters'
import { useEstadoPagoIngresoDetalle } from '../hooks/useEstadoPagoIngresoDetalle'
import { useAuth } from '../hooks/useAuth'
import { ESTADO_LABEL, ESTADO_VARIANT, requiereAprobar, siguientesEstados } from '../lib/estadosFlujo'
import { documentoPath, eliminarDocumento, getSignedUrl, subirDocumento } from '../services/storage'
import type { EstadoEPIngreso, EstadoPagoIngreso } from '../types'

interface Props {
  estadoPago: EstadoPagoIngreso
  onCambiarEstado: (id: string, estado: EstadoEPIngreso) => Promise<void>
  onRegistrarCobro: (id: string, montoCobrado: number) => Promise<void>
}

export default function DetalleEstadoPagoIngreso({ estadoPago, onCambiarEstado, onRegistrarCobro }: Props) {
  const { puedeEditar, puedeAprobar } = useAuth()
  const [open, setOpen] = useState(false)
  const { documentos, historial, agregarDocumento, eliminarDocumentoFila } = useEstadoPagoIngresoDetalle(open ? estadoPago.id : null)
  const [subiendo, setSubiendo] = useState(false)
  const [cambiandoEstado, setCambiandoEstado] = useState(false)
  const [montoCobrado, setMontoCobrado] = useState(String(estadoPago.monto_neto))
  const inputRef = useRef<HTMLInputElement>(null)

  const opciones = siguientesEstados(estadoPago.estado)

  async function onElegirArchivo(file: File | null) {
    if (!file) return
    setSubiendo(true)
    try {
      const path = documentoPath(estadoPago.id, crypto.randomUUID(), file.name)
      await subirDocumento(file, path)
      await agregarDocumento(file.name, path)
      toast.success('Documento adjuntado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir el documento')
    } finally {
      setSubiendo(false)
    }
  }

  async function onVerDocumento(path: string) {
    try {
      const url = await getSignedUrl(path)
      window.open(url, '_blank')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo abrir el documento')
    }
  }

  async function onEliminarDocumento(id: string, path: string) {
    if (!confirm('¿Eliminar este documento?')) return
    try {
      await eliminarDocumento(path)
      await eliminarDocumentoFila(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar el documento')
    }
  }

  async function onCambiar(destino: EstadoEPIngreso) {
    setCambiandoEstado(true)
    try {
      if (destino === 'pagado') await onRegistrarCobro(estadoPago.id, Number(montoCobrado) || 0)
      else await onCambiarEstado(estadoPago.id, destino)
      toast.success(`Estado cambiado a ${ESTADO_LABEL[destino]}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cambiar el estado')
    } finally {
      setCambiandoEstado(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Detalle
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>EP {estadoPago.numero_ep}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 text-sm">
          <div className="flex items-center gap-3">
            <Badge variant={ESTADO_VARIANT[estadoPago.estado]}>{ESTADO_LABEL[estadoPago.estado]}</Badge>
            {estadoPago.periodo && <span className="text-muted-foreground">Período: {estadoPago.periodo}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Monto bruto</p>
              <p className="font-medium tabular-nums">{formatCLP(estadoPago.monto_bruto)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Monto neto</p>
              <p className="font-medium tabular-nums">{formatCLP(estadoPago.monto_neto)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cobrado</p>
              <p className="font-medium tabular-nums">{formatCLP(estadoPago.monto_cobrado)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saldo pendiente</p>
              <p className="font-medium tabular-nums">{formatCLP(estadoPago.saldo_pendiente)}</p>
            </div>
          </div>

          {estadoPago.observaciones && (
            <div>
              <p className="text-xs text-muted-foreground">Observaciones</p>
              <p>{estadoPago.observaciones}</p>
            </div>
          )}

          {opciones.length > 0 && (puedeEditar || puedeAprobar) && (
            <div className="flex flex-col gap-2 rounded-md border p-3">
              <p className="text-xs font-medium text-muted-foreground">Cambiar estado</p>
              <div className="flex flex-wrap items-center gap-2">
                {opciones.map((destino) => {
                  const bloqueado = requiereAprobar(destino) && !puedeAprobar
                  return (
                    <Button
                      key={destino}
                      size="sm"
                      variant={destino === 'rechazado' ? 'outline' : 'default'}
                      disabled={bloqueado || cambiandoEstado}
                      title={bloqueado ? 'Necesitás permiso para aprobar' : undefined}
                      onClick={() => onCambiar(destino)}
                    >
                      {ESTADO_LABEL[destino]}
                    </Button>
                  )
                })}
                {estadoPago.estado === 'aprobado' && puedeAprobar && (
                  <MontoInput
                    value={montoCobrado ? Number(montoCobrado) : null}
                    onChange={(v) => setMontoCobrado(v != null ? String(v) : '')}
                    className="h-9 w-32 rounded-md border px-2 text-sm"
                    title="Monto cobrado"
                  />
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Documentos</p>
              {(puedeEditar || puedeAprobar) && (
                <>
                  <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => onElegirArchivo(e.target.files?.[0] ?? null)}
                  />
                  <Button type="button" variant="outline" size="sm" disabled={subiendo} onClick={() => inputRef.current?.click()}>
                    {subiendo ? 'Subiendo…' : 'Adjuntar'}
                  </Button>
                </>
              )}
            </div>
            {documentos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin documentos adjuntos.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {documentos.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                    <button type="button" className="flex items-center gap-2 text-left hover:underline" onClick={() => onVerDocumento(d.storage_path)}>
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      {d.nombre}
                    </button>
                    {(puedeEditar || puedeAprobar) && (
                      <Button variant="ghost" size="icon" onClick={() => onEliminarDocumento(d.id, d.storage_path)}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Historial</p>
            {historial.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin cambios de estado todavía.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {historial.map((h) => (
                  <li key={h.id} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{formatFecha(h.created_at.slice(0, 10))}</span>
                    <span>
                      {h.estado_anterior ? `${ESTADO_LABEL[h.estado_anterior]} → ` : ''}
                      {ESTADO_LABEL[h.estado_nuevo]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
