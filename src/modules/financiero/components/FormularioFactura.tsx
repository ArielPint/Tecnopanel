import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/modules/financiero/components/ui/dialog'
import RelacionOCFactura from '@/modules/financiero/components/RelacionOCFactura'
import BuscadorProveedor from '@/modules/financiero/components/BuscadorProveedor'
import UploadPDF from '@/modules/financiero/components/UploadPDF'
import { usePresupuestosLookup } from '@/modules/financiero/hooks/usePresupuestosLookup'
import { pdfPath, subirPdf } from '@/modules/financiero/services/pdfStorage'
import { notificarFacturaSuperaOC } from '@/modules/financiero/services/notificaciones'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import { cn } from '@/lib/utils'
import type { Factura, OrdenCompra } from '@/modules/financiero/types/financiero'

interface FormularioFacturaProps {
  factura?: Factura
  facturas: Factura[]
  ordenesCompra: OrdenCompra[]
  onCreate: (input: {
    numero_factura: string | null
    ordenes_compra_id: string
    proveedor_rut: string | null
    fecha: string
    monto: number
    descuento: number
    observacion: string | null
    pdf_path: null
  }) => Promise<Factura>
  onUpdate: (id: string, patch: Partial<Factura>) => Promise<Factura>
}

export default function FormularioFactura({ factura, facturas, ordenesCompra, onCreate, onUpdate }: FormularioFacturaProps) {
  const { presupuestos } = usePresupuestosLookup()
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const esEdicion = !!factura

  const [numeroFactura, setNumeroFactura] = useState(factura?.numero_factura ?? '')
  const [ordenesCompraId, setOrdenesCompraId] = useState(factura?.ordenes_compra_id ?? '')
  const [proveedorRut, setProveedorRut] = useState(factura?.proveedor_rut ?? '')
  const [fecha, setFecha] = useState(factura?.fecha ?? new Date().toISOString().slice(0, 10))
  const [monto, setMonto] = useState(String(factura?.monto ?? ''))
  const [descuento, setDescuento] = useState(String(factura?.descuento ?? '0'))
  const [observacion, setObservacion] = useState(factura?.observacion ?? '')
  const [archivoPdf, setArchivoPdf] = useState<File | null>(null)

  const ocSeleccionada = ordenesCompra.find((oc) => oc.id === ordenesCompraId)
  const yaFacturado = useMemo(() => {
    if (!ordenesCompraId) return 0
    return facturas
      .filter((f) => f.ordenes_compra_id === ordenesCompraId && f.estado !== 'ANULADA' && f.id !== factura?.id)
      .reduce((suma, f) => suma + f.monto, 0)
  }, [facturas, ordenesCompraId, factura?.id])
  const saldoDisponible = ocSeleccionada ? ocSeleccionada.neto - yaFacturado : null

  // Un mismo N° de factura puede repetirse entre OC distintas si una factura
  // real se reparte en varias líneas — pero si además coincide el RUT
  // proveedor, es casi seguro que se está por cargar la misma factura de nuevo.
  const facturaDuplicada = useMemo(() => {
    const numero = numeroFactura.trim().toLowerCase()
    const rut = proveedorRut.trim().toLowerCase()
    if (!numero || !rut) return null
    return facturas.find(
      (f) =>
        f.id !== factura?.id &&
        f.numero_factura?.trim().toLowerCase() === numero &&
        f.proveedor_rut?.trim().toLowerCase() === rut,
    )
  }, [facturas, numeroFactura, proveedorRut, factura?.id])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ordenesCompraId) {
      toast.error('Elegí a qué OC corresponde la factura')
      return
    }
    setEnviando(true)
    try {
      let resultado: Factura
      if (esEdicion && factura) {
        resultado = await onUpdate(factura.id, {
          numero_factura: numeroFactura || null,
          ordenes_compra_id: ordenesCompraId,
          proveedor_rut: proveedorRut || null,
          fecha,
          monto: Number(monto),
          descuento: Number(descuento) || 0,
          observacion: observacion || null,
        })
      } else {
        resultado = await onCreate({
          numero_factura: numeroFactura || null,
          ordenes_compra_id: ordenesCompraId,
          proveedor_rut: proveedorRut || null,
          fecha,
          monto: Number(monto),
          descuento: Number(descuento) || 0,
          observacion: observacion || null,
          pdf_path: null,
        })
      }
      if (archivoPdf) {
        const oc = ordenesCompra.find((o) => o.id === ordenesCompraId)
        const codigoArticulo = presupuestos.find((p) => p.id === oc?.presupuesto_id)?.codigo_articulo
        if (codigoArticulo) {
          const path = pdfPath('factura', codigoArticulo, resultado.id)
          await subirPdf(archivoPdf, path)
          await onUpdate(resultado.id, { pdf_path: path })
        }
      }

      if (resultado.estado === 'SUPERA_OC') {
        toast.warning('Factura guardada, pero supera el monto de la OC')
        const oc = ordenesCompra.find((o) => o.id === ordenesCompraId)
        void notificarFacturaSuperaOC(
          `⚠️ Factura ${resultado.numero_factura ?? '(sin número)'} de ${formatCLP(resultado.monto)} ` +
            `supera el monto de la OC ${oc?.numero_oc ?? ordenesCompraId} (neto ${formatCLP(oc?.neto)}).`,
        )
      } else {
        toast.success(esEdicion ? 'Factura actualizada' : 'Factura creada')
      }
      if (!esEdicion) {
        setNumeroFactura('')
        setOrdenesCompraId('')
        setProveedorRut('')
        setMonto('')
        setDescuento('0')
        setObservacion('')
        setArchivoPdf(null)
      }
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar la factura')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={esEdicion ? 'outline' : 'default'} size={esEdicion ? 'sm' : 'default'}>
          {esEdicion ? 'Editar' : 'Nueva Factura'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar Factura' : 'Nueva Factura'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="numero_factura">N° Factura</Label>
            <Input
              id="numero_factura"
              value={numeroFactura ?? ''}
              onChange={(e) => setNumeroFactura(e.target.value)}
              placeholder="Opcional si aún no llegó el número"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Orden de Compra</Label>
            <RelacionOCFactura
              ordenesCompra={ordenesCompra}
              value={ordenesCompraId}
              onChange={setOrdenesCompraId}
              onSelectOC={(oc) => {
                if (oc.proveedor_rut) setProveedorRut(oc.proveedor_rut)
              }}
            />
            {ocSeleccionada && saldoDisponible !== null && (
              <p className={cn('text-sm', saldoDisponible < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                Ya facturado {formatCLP(yaFacturado)} de {formatCLP(ocSeleccionada.neto)} — saldo disponible{' '}
                {formatCLP(saldoDisponible)}
              </p>
            )}
          </div>
          <BuscadorProveedor rut={proveedorRut ?? ''} onRutChange={setProveedorRut} onResolved={() => {}} />
          <div className="flex flex-col gap-1.5">
            {facturaDuplicada && (
              <p className="flex items-center gap-1.5 text-sm text-warning">
                <AlertTriangle className="size-3.5 shrink-0" />
                Ya existe una factura {facturaDuplicada.numero_factura} de este proveedor — revisá que no sea un
                duplicado.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fecha">Fecha</Label>
            <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monto">Monto (CLP)</Label>
            <Input id="monto" type="number" min="0" step="1" value={monto} onChange={(e) => setMonto(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="descuento">Descuento (CLP)</Label>
            <Input
              id="descuento"
              type="number"
              min="0"
              step="1"
              value={descuento}
              onChange={(e) => setDescuento(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="observacion">Observación</Label>
            <Textarea id="observacion" value={observacion ?? ''} onChange={(e) => setObservacion(e.target.value)} />
          </div>
          <UploadPDF tienePdfExistente={!!factura?.pdf_path} onFileChange={setArchivoPdf} />
          <DialogFooter>
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
