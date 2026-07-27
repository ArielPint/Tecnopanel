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
import UploadPDF from '@/modules/financiero/components/UploadPDF'
import BuscadorPresupuestoWip from '@/modules/financiero/components/BuscadorPresupuestoWip'
import BuscadorProveedor from '@/modules/financiero/components/BuscadorProveedor'
import { usePresupuestosLookup, type PresupuestoLookup } from '@/modules/financiero/hooks/usePresupuestosLookup'
import { pdfPath, subirPdf } from '@/modules/financiero/services/pdfStorage'
import { extraerDatosOC } from '@/modules/financiero/services/extraccionOC'
import type { OrdenCompra } from '@/modules/financiero/types/financiero'

interface FormularioOCProps {
  ordenCompra?: OrdenCompra
  ordenesCompra: OrdenCompra[]
  onCreate: (input: {
    numero_oc: string
    presupuesto_id: string
    proveedor_rut: string | null
    nombre_proveedor_raw: string | null
    fecha: string
    neto: number
    detalle: string | null
    pdf_path: null
  }) => Promise<OrdenCompra>
  onUpdate: (id: string, patch: Partial<OrdenCompra>) => Promise<OrdenCompra>
}

export default function FormularioOC({ ordenCompra, ordenesCompra, onCreate, onUpdate }: FormularioOCProps) {
  const { presupuestos } = usePresupuestosLookup()
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const esEdicion = !!ordenCompra
  const presupuestoActual = presupuestos.find((p) => p.id === ordenCompra?.presupuesto_id)

  const [numeroOc, setNumeroOc] = useState(ordenCompra?.numero_oc ?? '')
  const [codigoWip, setCodigoWip] = useState(presupuestoActual?.tarea_wip ?? '')
  const [presupuesto, setPresupuesto] = useState<PresupuestoLookup | null>(presupuestoActual ?? null)
  const [proveedorRut, setProveedorRut] = useState(ordenCompra?.proveedor_rut ?? '')
  const [nombreProveedorRaw, setNombreProveedorRaw] = useState(ordenCompra?.nombre_proveedor_raw ?? '')
  const [fecha, setFecha] = useState(ordenCompra?.fecha ?? new Date().toISOString().slice(0, 10))
  const [neto, setNeto] = useState(String(ordenCompra?.neto ?? ''))
  const [detalle, setDetalle] = useState(ordenCompra?.detalle ?? '')
  const [archivoPdf, setArchivoPdf] = useState<File | null>(null)
  const [extrayendo, setExtrayendo] = useState(false)

  // El N° de OC es único: si ya existe otra línea con el mismo número,
  // probablemente se está por cargar un duplicado.
  const ocDuplicada = useMemo(() => {
    const numero = numeroOc.trim().toLowerCase()
    if (!numero) return null
    return ordenesCompra.find((oc) => oc.id !== ordenCompra?.id && oc.numero_oc.trim().toLowerCase() === numero)
  }, [ordenesCompra, numeroOc, ordenCompra?.id])

  // Al elegir un PDF nuevo, se manda a extraer los datos con IA y se
  // precargan los campos — el usuario siempre puede corregirlos antes de
  // guardar, nada se autocompleta "a ciegas" sin pasar por acá.
  const onArchivoChange = async (file: File | null) => {
    setArchivoPdf(file)
    if (!file) return
    setExtrayendo(true)
    try {
      const datos = await extraerDatosOC(file)
      const faltantes: string[] = []

      if (datos.numero_oc !== 'NO_ENCONTRADO') setNumeroOc(datos.numero_oc)
      else faltantes.push('N° OC')

      if (datos.proveedor_rut !== 'NO_ENCONTRADO') setProveedorRut(datos.proveedor_rut)
      else faltantes.push('RUT proveedor')

      if (datos.proveedor !== 'NO_ENCONTRADO') setNombreProveedorRaw(datos.proveedor)

      if (datos.fecha !== 'NO_ENCONTRADO') setFecha(datos.fecha)
      else faltantes.push('fecha')

      // El "total" que lee el PDF viene con IVA incluido (verificado contra
      // datos reales: OC 5900 tiene total $4.284.000 en el PDF y neto
      // $3.600.000 en la base — $3.600.000 × 1.19 = $4.284.000 exacto).
      // El campo Neto de la OC va sin IVA, así que se ajusta acá.
      const totalConIva = Number(datos.total)
      if (datos.total !== 'NO_ENCONTRADO' && !Number.isNaN(totalConIva)) {
        setNeto(String(Math.round(totalConIva / 1.19)))
      } else {
        faltantes.push('total')
      }

      if (faltantes.length > 0) {
        toast.warning(`No se pudo leer del PDF: ${faltantes.join(', ')}. Completalo manualmente.`)
      } else {
        toast.success('Datos extraídos del PDF — revisá antes de guardar')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo extraer datos del PDF, completá el formulario manualmente')
    } finally {
      setExtrayendo(false)
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!presupuesto) {
      toast.error('Ingresá un código WIP válido')
      return
    }
    setEnviando(true)
    try {
      let registro: OrdenCompra
      if (esEdicion && ordenCompra) {
        registro = await onUpdate(ordenCompra.id, {
          numero_oc: numeroOc,
          presupuesto_id: presupuesto.id,
          proveedor_rut: proveedorRut || null,
          nombre_proveedor_raw: nombreProveedorRaw || null,
          fecha,
          neto: Number(neto),
          detalle: detalle || null,
        })
      } else {
        registro = await onCreate({
          numero_oc: numeroOc,
          presupuesto_id: presupuesto.id,
          proveedor_rut: proveedorRut || null,
          nombre_proveedor_raw: nombreProveedorRaw || null,
          fecha,
          neto: Number(neto),
          detalle: detalle || null,
          pdf_path: null,
        })
      }

      if (archivoPdf) {
        const path = pdfPath('oc', presupuesto.codigo_articulo, registro.id)
        await subirPdf(archivoPdf, path)
        await onUpdate(registro.id, { pdf_path: path })
      }

      toast.success(esEdicion ? 'OC actualizada' : 'OC creada')
      if (!esEdicion) {
        setNumeroOc('')
        setCodigoWip('')
        setPresupuesto(null)
        setProveedorRut('')
        setNombreProveedorRaw('')
        setNeto('')
        setDetalle('')
        setArchivoPdf(null)
      }
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar la OC')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={esEdicion ? 'outline' : 'default'} size={esEdicion ? 'sm' : 'default'}>
          {esEdicion ? 'Editar' : 'Nueva OC'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar Orden de Compra' : 'Nueva Orden de Compra'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="numero_oc">N° OC</Label>
            <Input id="numero_oc" value={numeroOc} onChange={(e) => setNumeroOc(e.target.value)} required />
            {ocDuplicada && (
              <p className="flex items-center gap-1.5 text-sm text-warning">
                <AlertTriangle className="size-3.5 shrink-0" />
                Ya existe la OC {ocDuplicada.numero_oc} — revisá que no sea un duplicado.
              </p>
            )}
          </div>
          <BuscadorPresupuestoWip codigoWip={codigoWip} onCodigoWipChange={setCodigoWip} onResolved={setPresupuesto} />
          <BuscadorProveedor
            rut={proveedorRut ?? ''}
            onRutChange={setProveedorRut}
            onResolved={(nombre) => {
              if (nombre) setNombreProveedorRaw(nombre)
            }}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nombre_proveedor_raw">Nombre proveedor</Label>
            <Input
              id="nombre_proveedor_raw"
              value={nombreProveedorRaw ?? ''}
              onChange={(e) => setNombreProveedorRaw(e.target.value)}
              placeholder="Se completa solo si el RUT ya está guardado, o escribilo a mano"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fecha">Fecha</Label>
            <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="neto">Neto (CLP)</Label>
            <Input id="neto" type="number" min="0" step="1" value={neto} onChange={(e) => setNeto(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="detalle">Detalle</Label>
            <Textarea id="detalle" value={detalle ?? ''} onChange={(e) => setDetalle(e.target.value)} />
          </div>
          <UploadPDF tienePdfExistente={!!ordenCompra?.pdf_path} onFileChange={onArchivoChange} />
          {extrayendo && <p className="text-xs text-muted-foreground">Extrayendo datos del PDF…</p>}
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
