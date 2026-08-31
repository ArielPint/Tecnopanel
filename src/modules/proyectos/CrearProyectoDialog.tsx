import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
import { getLineasNegocio, abreviaturaSucursal, SUCURSALES, type LineaNegocio, type Sucursal } from '@/lib/lineasNegocio'
import { useCrearProyecto } from './useCrearProyecto'

// Mismo catálogo cerrado que ya usa proyecto_modulos para La Chacra — el admin
// elige cuáles habilitar en vez de copiarlos todos a ciegas.
const MODULOS_DISPONIBLES = [
  { key: 'dashboard', label: 'Principal' },
  { key: 'produccion', label: 'Producción' },
  { key: 'obra', label: 'Avance Obra' },
  { key: 'logistica', label: 'Logística' },
  { key: 'solicitudes', label: 'Solicitudes' },
  { key: 'financiero', label: 'Financiero' },
  { key: 'estados_pago', label: 'Estados de Pago' },
  { key: 'estados_pago_ingresos', label: 'Estados de Pago (Ingresos)' },
  { key: 'settings', label: 'Configuración' },
] as const

function slugify(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export default function CrearProyectoDialog({ onCreado }: { onCreado: () => void }) {
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTocado, setSlugTocado] = useState(false)
  const [modulos, setModulos] = useState<string[]>([])
  const [modulosTocados, setModulosTocados] = useState(false)
  const [lineas, setLineas] = useState<string[]>([])
  const [sucursal, setSucursal] = useState<Sucursal | ''>('')
  const [catalogo, setCatalogo] = useState<LineaNegocio[]>([])
  const { crear, creando } = useCrearProyecto()

  useEffect(() => {
    getLineasNegocio()
      .then(setCatalogo)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'No se pudieron cargar las líneas de negocio'))
  }, [])

  const seleccionadas = useMemo(() => catalogo.filter((l) => lineas.includes(l.id)), [catalogo, lineas])

  // Los módulos se premarcan con la unión de los modulos_default de las líneas
  // elegidas, hasta que el admin toque un checkbox — desde ahí manda él.
  useEffect(() => {
    if (modulosTocados) return
    setModulos([...new Set(seleccionadas.flatMap((l) => l.modulos_default))])
  }, [seleccionadas, modulosTocados])

  // Slug sugerido con prefijo de línea y sufijo de sucursal: vit-proyecto-2-pv.
  useEffect(() => {
    if (slugTocado) return
    const prefijo = seleccionadas.map((l) => l.codigo).join('-')
    const sufijo = sucursal ? abreviaturaSucursal(sucursal) : ''
    setSlug(slugify([prefijo, nombre, sufijo].filter(Boolean).join(' ')))
  }, [seleccionadas, nombre, sucursal, slugTocado])

  function resetear() {
    setNombre('')
    setSlug('')
    setSlugTocado(false)
    setModulos([])
    setModulosTocados(false)
    setLineas([])
    setSucursal('')
  }

  function toggleModulo(key: string, checked: boolean) {
    setModulosTocados(true)
    setModulos((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)))
  }

  function toggleLinea(id: string, checked: boolean) {
    setLineas((prev) => (checked ? [...prev, id] : prev.filter((l) => l !== id)))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (lineas.length === 0) return toast.error('Elegí al menos una línea de negocio')
    if (!sucursal) return toast.error('Elegí la sucursal')
    try {
      await crear({ nombre, slug, modulos, lineas, sucursal })
      toast.success(`Proyecto "${nombre}" creado`)
      setOpen(false)
      onCreado()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear el proyecto')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) resetear()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Nuevo proyecto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo proyecto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Línea de negocio</Label>
            <div className="grid grid-cols-3 gap-2">
              {catalogo.map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={lineas.includes(l.id)}
                    onCheckedChange={(checked) => toggleLinea(l.id, checked === true)}
                  />
                  {l.nombre}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Puede tener más de una. Los módulos se premarcan según lo que elijas.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sucursal">Sucursal</Label>
            {/* select nativo a propósito: el Select de Radix adentro de este Dialog
                dejaba pointer-events:none pegado en el body al cerrar el diálogo
                por código tras crear, y la página quedaba sin clics hasta recargar. */}
            <select
              id="sucursal"
              value={sucursal}
              onChange={(e) => setSucursal(e.target.value as Sucursal)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Elegir sucursal</option>
              {SUCURSALES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug (URL)</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlug(slugify(e.target.value))
                setSlugTocado(true)
              }}
              required
            />
            <p className="text-xs text-muted-foreground">/proyectos/{slug || '...'}/dashboard</p>
          </div>
          <div className="space-y-2">
            <Label>Módulos a habilitar</Label>
            <div className="grid grid-cols-2 gap-2">
              {MODULOS_DISPONIBLES.map((m) => (
                <label key={m.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={modulos.includes(m.key)}
                    onCheckedChange={(checked) => toggleModulo(m.key, checked === true)}
                  />
                  {m.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Los accesos de usuarios se asignan después desde /usuarios.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={creando}>
              {creando ? 'Creando…' : 'Crear proyecto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
