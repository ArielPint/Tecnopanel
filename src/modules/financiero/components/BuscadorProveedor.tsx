import { useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Button } from '@/modules/financiero/components/ui/button'
import { useProveedores } from '@/modules/financiero/hooks/useProveedores'

interface BuscadorProveedorProps {
  rut: string
  onRutChange: (rut: string) => void
  onResolved: (nombre: string | null) => void
}

// Mismo patrón que BuscadorPresupuestoWip: se tipea el RUT y se resuelve solo
// el nombre desde financiero_proveedores; si no existe, se puede cargar acá
// mismo (queda disponible para el resto de la web: OC, Facturas, Gastos Directos).
export default function BuscadorProveedor({ rut, onRutChange, onResolved }: BuscadorProveedorProps) {
  const { proveedores, crearProveedor } = useProveedores()
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [creando, setCreando] = useState(false)

  const encontrado = proveedores.find((p) => p.rut === rut.trim())

  const onChange = (value: string) => {
    onRutChange(value)
    const p = proveedores.find((p) => p.rut === value.trim())
    onResolved(p?.nombre ?? null)
  }

  const onCrear = async () => {
    if (!rut.trim() || !nombreNuevo.trim()) return
    setCreando(true)
    try {
      const p = await crearProveedor(rut.trim(), nombreNuevo.trim())
      onResolved(p.nombre)
      setNombreNuevo('')
      toast.success('Proveedor guardado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el proveedor')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="proveedor_rut">RUT proveedor</Label>
      <Input id="proveedor_rut" value={rut} onChange={(e) => onChange(e.target.value)} placeholder="Ej: 76320186-4" />
      {rut.trim() === '' ? (
        <p className="text-sm text-muted-foreground">Ingresá el RUT del proveedor</p>
      ) : encontrado ? (
        <p className="text-sm text-muted-foreground">{encontrado.nombre}</p>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="proveedor_nombre_nuevo" className="text-xs text-warning">
              Proveedor nuevo — ingresá el nombre para guardarlo
            </Label>
            <Input
              id="proveedor_nombre_nuevo"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              placeholder="Nombre del proveedor"
            />
          </div>
          <Button type="button" size="sm" variant="outline" disabled={creando || !nombreNuevo.trim()} onClick={onCrear}>
            {creando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      )}
    </div>
  )
}
