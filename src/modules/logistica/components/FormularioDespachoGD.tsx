import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import { formatCLP } from '@/modules/financiero/utils/formatters'
import type { CatalogoModulos } from '../lib/catalogoModulos'
import type { DespachoGD, NuevoDespachoGD } from '../hooks/useDespachosGD'

interface Props {
  despacho?: DespachoGD
  despachos: DespachoGD[]
  catalogo: CatalogoModulos
  modulosTerminados: Set<string>
  onCreate: (input: NuevoDespachoGD) => Promise<void>
  onUpdate: (id: number, input: NuevoDespachoGD) => Promise<void>
}

const hoy = () => new Date().toISOString().slice(0, 10)

export default function FormularioDespachoGD({ despacho, despachos, catalogo, modulosTerminados, onCreate, onUpdate }: Props) {
  const esEdicion = !!despacho
  const [open, setOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const [fechaGd, setFechaGd] = useState(despacho?.fecha_gd ?? hoy())
  const [fechaDesp, setFechaDesp] = useState(despacho?.fecha_despacho ?? hoy())
  const [gdNumero, setGdNumero] = useState(despacho?.gd_numero ?? '')
  const [modulo, setModulo] = useState(despacho?.modulo ?? '')
  const [cantidad, setCantidad] = useState(String(despacho?.cantidad ?? 1))
  const [montoNeto, setMontoNeto] = useState(String(despacho?.monto_neto ?? ''))
  const [avance, setAvance] = useState(despacho?.avance != null ? String(despacho.avance) : '')

  const infoModulo = modulo ? catalogo.modulos[modulo] : undefined
  const serie = infoModulo?.nroSerie ?? despacho?.modulo_nro_serie ?? ''
  const torre = infoModulo?.torre ?? despacho?.torre ?? ''
  const tipo = infoModulo?.tipo ?? despacho?.tipo ?? ''

  const ultimoMontoModulo = (() => {
    if (!modulo) return null
    const prev = despachos.filter((d) => d.modulo === modulo && d.id !== despacho?.id)
    return prev.length ? prev[prev.length - 1].monto_neto : null
  })()

  // Solo módulos con producción terminada y que no tengan ya un despacho registrado
  // (excepto el propio, si se está editando) — el selector queda acotado a lo pendiente.
  const modulosEnviados = new Set(despachos.filter((d) => d.id !== despacho?.id).map((d) => d.modulo).filter(Boolean))
  const modulosDisponibles = Object.keys(catalogo.modulos).filter(
    (m) => modulosTerminados.has(m) && !modulosEnviados.has(m),
  )
  if (despacho?.modulo && !modulosDisponibles.includes(despacho.modulo)) modulosDisponibles.push(despacho.modulo)
  modulosDisponibles.sort()

  function limpiar() {
    setFechaGd(hoy())
    setFechaDesp(hoy())
    setGdNumero('')
    setModulo('')
    setCantidad('1')
    setMontoNeto('')
    setAvance('')
  }

  async function onSubmit(e: FormEvent, seguirAgregando: boolean) {
    e.preventDefault()
    if (!gdNumero.trim()) {
      toast.error('GD # es obligatorio')
      return
    }
    if (!modulo) {
      toast.error('Selecciona un módulo')
      return
    }
    setEnviando(true)
    try {
      const input: NuevoDespachoGD = {
        fecha_gd: fechaGd || null,
        fecha_despacho: fechaDesp || null,
        gd_numero: gdNumero.trim(),
        modulo_nro_serie: serie || null,
        cantidad: parseInt(cantidad) || 1,
        monto_neto: parseFloat(montoNeto) || 0,
        modulo,
        torre: torre || null,
        tipo: tipo || null,
        avance: avance !== '' ? parseInt(avance) : null,
      }
      if (esEdicion && despacho) {
        await onUpdate(despacho.id, input)
        toast.success('Registro actualizado')
        setOpen(false)
      } else {
        await onCreate(input)
        toast.success('Registro guardado')
        if (seguirAgregando) {
          const fg = fechaGd
          const fd = fechaDesp
          limpiar()
          setFechaGd(fg)
          setFechaDesp(fd)
        } else {
          limpiar()
          setOpen(false)
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v && !esEdicion) limpiar()
      }}
    >
      <DialogTrigger asChild>
        <Button variant={esEdicion ? 'outline' : 'default'} size={esEdicion ? 'sm' : 'default'}>
          {esEdicion ? 'Editar' : '+ Nueva Entrada'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar Entrada' : 'Nueva Entrada'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => onSubmit(e, false)} className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fecha_gd">Fecha GD</Label>
            <Input id="fecha_gd" type="date" value={fechaGd} onChange={(e) => setFechaGd(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fecha_desp">Fecha Despacho</Label>
            <Input id="fecha_desp" type="date" value={fechaDesp} onChange={(e) => setFechaDesp(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gd_numero">GD #</Label>
            <Input id="gd_numero" placeholder="Ej: 44270" value={gdNumero} onChange={(e) => setGdNumero(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Módulo</Label>
            <Select value={modulo} onValueChange={setModulo}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="— Seleccionar —" />
              </SelectTrigger>
              <SelectContent>
                {modulosDisponibles.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m} · {catalogo.modulos[m]?.torre ?? '—'} · {catalogo.modulos[m]?.tipo ?? '—'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Nro Serie <span className="text-xs text-muted-foreground">(auto)</span></Label>
            <Input value={serie} readOnly placeholder="—" className="text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cantidad">Cantidad</Label>
            <Input id="cantidad" type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </div>

          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="monto_neto">Monto Neto</Label>
            <Input id="monto_neto" type="number" min="0" placeholder="0" value={montoNeto} onChange={(e) => setMontoNeto(e.target.value)} />
            {ultimoMontoModulo != null && (
              <p className="text-xs text-muted-foreground">Último monto para {modulo}: {formatCLP(ultimoMontoModulo)}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="avance">Avance (%)</Label>
            <Input id="avance" type="number" min="0" max="100" placeholder="0" value={avance} onChange={(e) => setAvance(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Torre <span className="text-xs text-muted-foreground">(auto)</span></Label>
            <Input value={torre} readOnly placeholder="—" className="text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tipo <span className="text-xs text-muted-foreground">(auto)</span></Label>
            <Input value={tipo} readOnly placeholder="—" className="text-muted-foreground" />
          </div>

          <DialogFooter className="col-span-2">
            {!esEdicion && (
              <Button type="button" variant="outline" disabled={enviando} onClick={(e) => onSubmit(e, true)}>
                Guardar y agregar otro
              </Button>
            )}
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
