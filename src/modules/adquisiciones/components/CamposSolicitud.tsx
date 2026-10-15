import { useEffect, useState } from 'react'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { cn } from '@/lib/utils'
import { hoyChile } from '@/modules/sso/lib/estados'
import { AREAS } from '../lib/catalogos'
import { usePermisosAdq } from '../hooks/usePermisosAdq'
import { etiquetaCeco, listarCentrosCosto, listarProyectos, type CentroCosto, type DatosSolicitud, type Item } from '../lib/api'

// Campos de la solicitud, compartidos por Nueva solicitud y Editar (detalle).

export function datosVacios(sucursal: string | null): DatosSolicitud {
  return {
    sucursal: sucursal ?? '',
    area: '',
    titulo: '',
    justificacion: null,
    proyecto_id: null,
    centro_costo: null,
    prioridad: 'normal',
    fecha_requerida: null,
    lugar_entrega: null,
  }
}

/** Mensaje del primer problema, o null si se puede guardar. */
export function validarSolicitud(d: DatosSolicitud, items: Item[], nueva: boolean): string | null {
  const falta = (
    [
      ['qué se compra', d.titulo],
      ['centro de costo', d.centro_costo],
      ['área que solicita', d.area],
      ['sucursal', d.sucursal],
    ] as const
  )
    .filter(([, v]) => !v?.trim())
    .map(([k]) => k)
  if (falta.length) return `Falta completar: ${falta.join(', ')}.`
  if (nueva && d.fecha_requerida && d.fecha_requerida < hoyChile()) return 'La fecha requerida no puede ser anterior a hoy.'
  if (items.length === 0) return 'Agrega al menos un ítem.'
  const malo = items.findIndex((it) => !it.descripcion.trim() || !(it.cantidad > 0))
  if (malo >= 0) return `El ítem ${malo + 1} necesita descripción y una cantidad mayor que cero.`
  return null
}

export function limpiarSolicitud(d: DatosSolicitud): DatosSolicitud {
  const t = (v: string | null) => (v?.trim() ? v.trim() : null)
  return {
    ...d,
    titulo: d.titulo.trim(),
    area: d.area.trim(),
    justificacion: t(d.justificacion),
    centro_costo: t(d.centro_costo),
    lugar_entrega: t(d.lugar_entrega),
    fecha_requerida: d.fecha_requerida || null,
  }
}

export function Seccion({ titulo, detalle, children }: { titulo: string; detalle?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-lg border bg-card p-4">
      <legend className="px-1 text-sm font-bold">{titulo}</legend>
      {detalle && <p className="-mt-1 text-xs text-muted-foreground">{detalle}</p>}
      {children}
    </fieldset>
  )
}

const grid = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'
export const selectClase = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm'

export default function CamposSolicitud({
  datos,
  onChange,
  nueva,
}: {
  datos: DatosSolicitud
  onChange: (d: DatosSolicitud) => void
  nueva: boolean
}) {
  const set = <K extends keyof DatosSolicitud>(k: K, v: DatosSolicitud[K]) => onChange({ ...datos, [k]: v })
  const [proyectos, setProyectos] = useState<{ id: string; nombre: string }[]>([])
  const [todos, setTodos] = useState<CentroCosto[]>([])
  // Solo las sucursales donde la persona puede solicitar (rol por sucursal); los CECO sin sucursal, siempre
  const { sucursales } = usePermisosAdq()
  const permitidas = sucursales.solicitar
  const centros = todos.filter((c) => !c.sucursal || permitidas.includes(c.sucursal) || c.codigo === datos.centro_costo)

  useEffect(() => {
    listarProyectos().then(setProyectos).catch(() => setProyectos([]))
    listarCentrosCosto().then(setTodos).catch(() => setTodos([]))
  }, [])

  // El CECO dice la sucursal (4o dígito): la base la fija igual al guardar
  const ceco = centros.find((c) => c.codigo === datos.centro_costo)
  const grupos = [
    { label: 'Líneas de negocio', items: centros.filter((c) => c.linea && c.linea !== 'Administración') },
    { label: 'Administración', items: centros.filter((c) => c.linea === 'Administración') },
    { label: 'Otros', items: centros.filter((c) => !c.linea) },
  ].filter((g) => g.items.length)

  return (
    <Seccion titulo="Solicitud">
      <div className="space-y-1">
        <Label htmlFor="adq-titulo">¿Qué se necesita comprar?</Label>
        <Input id="adq-titulo" value={datos.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ej: Discos de corte para sierra de paneles" />
      </div>
      <div className={grid}>
        <div className="space-y-1">
          <Label htmlFor="adq-area">Área que solicita</Label>
          <Input id="adq-area" list="adq-areas" value={datos.area} onChange={(e) => set('area', e.target.value)} placeholder="Elige o escribe" />
          <datalist id="adq-areas">
            {AREAS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <Label htmlFor="adq-ceco">Centro de costo</Label>
          <select
            id="adq-ceco"
            value={datos.centro_costo ?? ''}
            onChange={(e) => {
              const c = centros.find((x) => x.codigo === e.target.value)
              onChange({ ...datos, centro_costo: e.target.value || null, sucursal: c?.sucursal ?? datos.sucursal })
            }}
            className={selectClase}
          >
            <option value="">Elegir centro de costo</option>
            {/* uno que ya no esté activo en SAP se sigue mostrando en solicitudes viejas */}
            {datos.centro_costo && !ceco && <option value={datos.centro_costo}>{datos.centro_costo}</option>}
            {grupos.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {etiquetaCeco(c.codigo, c.nombre)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="adq-sucursal">Sucursal</Label>
          <select
            id="adq-sucursal"
            value={datos.sucursal}
            onChange={(e) => set('sucursal', e.target.value)}
            disabled={!!ceco?.sucursal}
            title={ceco?.sucursal ? 'La define el centro de costo' : undefined}
            className={cn(selectClase, 'disabled:opacity-70')}
          >
            <option value="">Elegir sucursal</option>
            {[...new Set([...permitidas, ...(datos.sucursal ? [datos.sucursal] : [])])].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="adq-fecha">Se necesita para el</Label>
          <Input
            id="adq-fecha"
            type="date"
            min={nueva ? hoyChile() : undefined}
            value={datos.fecha_requerida ?? ''}
            onChange={(e) => set('fecha_requerida', e.target.value || null)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="adq-proyecto">Obra (si es para una)</Label>
          <select
            id="adq-proyecto"
            value={datos.proyecto_id ?? ''}
            onChange={(e) => set('proyecto_id', e.target.value || null)}
            className={selectClase}
          >
            <option value="">Sin obra</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="adq-entrega">Lugar de entrega</Label>
          <Input id="adq-entrega" value={datos.lugar_entrega ?? ''} onChange={(e) => set('lugar_entrega', e.target.value)} placeholder="Ej: Bodega Puerto Varas" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['normal', 'urgente'] as const).map((p) => (
          <label
            key={p}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm',
              datos.prioridad === p ? (p === 'urgente' ? 'border-destructive bg-destructive/10 text-destructive' : 'border-brand bg-brand/5') : 'hover:bg-accent/50',
            )}
          >
            <input type="radio" name="adq-prioridad" checked={datos.prioridad === p} onChange={() => set('prioridad', p)} className="accent-[hsl(var(--brand))]" />
            {p === 'urgente' ? 'Urgente' : 'Prioridad normal'}
          </label>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor="adq-just">Justificación</Label>
        <Textarea
          id="adq-just"
          rows={2}
          value={datos.justificacion ?? ''}
          onChange={(e) => set('justificacion', e.target.value)}
          placeholder="Para qué se necesita, reemplazo de…, proveedor sugerido, etc."
        />
      </div>
    </Seccion>
  )
}
