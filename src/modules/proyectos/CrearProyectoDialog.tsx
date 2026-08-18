import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/financiero/components/ui/dialog'
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
  const [modulos, setModulos] = useState<string[]>(MODULOS_DISPONIBLES.map((m) => m.key))
  const { crear, creando } = useCrearProyecto()

  function resetear() {
    setNombre('')
    setSlug('')
    setSlugTocado(false)
    setModulos(MODULOS_DISPONIBLES.map((m) => m.key))
  }

  function toggleModulo(key: string, checked: boolean) {
    setModulos((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await crear({ nombre, slug, modulos })
      toast.success(`Proyecto "${nombre}" creado`)
      setOpen(false)
      resetear()
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
              onChange={(e) => {
                setNombre(e.target.value)
                if (!slugTocado) setSlug(slugify(e.target.value))
              }}
              required
            />
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
