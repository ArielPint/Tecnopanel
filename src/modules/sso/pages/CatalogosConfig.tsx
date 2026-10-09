import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { guardarTipoCapacitacion, listarTiposCapacitacion } from '../lib/apiCapacitaciones'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { guardarEmpresa, guardarTipoExamen } from '../lib/apiTrabajadores'
import { formatearRut, normalizarRut, rutValido } from '../lib/rut'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useCatalogosTrabajadores } from '../hooks/useCatalogosTrabajadores'

// Catálogos de Configuración: empresas (propia + contratistas), tipos de examen ocupacional y tipos
// de capacitación, estos dos con su vigencia. Escribir exige Configuración > editar (RLS).

function mensaje(err: unknown, duplicado: string) {
  const m = err instanceof Error ? err.message : 'No se pudo guardar'
  return m.includes('duplicate') ? duplicado : m
}

export function EmpresasConfig() {
  const { puede } = usePermisosSso('configuracion')
  const { empresas, recargar, loading } = useCatalogosTrabajadores()
  const [nombre, setNombre] = useState('')
  const [rut, setRut] = useState('')
  const [guardando, setGuardando] = useState(false)
  const editable = puede('editar')

  async function guardar(fn: () => Promise<unknown>, ok: string) {
    setGuardando(true)
    try {
      await fn()
      toast.success(ok)
      await recargar()
      return true
    } catch (err) {
      toast.error(mensaje(err, 'Ya existe una empresa con ese nombre'))
      return false
    } finally {
      setGuardando(false)
    }
  }

  async function onCrear(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    if (rut && !rutValido(rut)) {
      toast.error('El RUT de la empresa no es válido')
      return
    }
    if (await guardar(() => guardarEmpresa({ nombre: nombre.trim(), rut: rut ? normalizarRut(rut) : null }), 'Empresa agregada')) {
      setNombre('')
      setRut('')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Tecnopanel y las empresas contratistas. Cada trabajador pertenece a una; una empresa inactiva deja de ofrecerse para
        trabajadores nuevos pero conserva los que ya tiene.
      </p>
      {editable && (
        <Card>
          <CardContent className="pt-5">
            <form onSubmit={onCrear} className="grid gap-2 sm:grid-cols-[1fr_200px_auto]">
              <Input placeholder="Nombre de la contratista" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              <Input placeholder="RUT empresa (opcional)" value={rut} onChange={(e) => setRut(e.target.value)} />
              <Button type="submit" disabled={guardando || !nombre.trim()}>
                Agregar empresa
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>RUT</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="w-24">Activa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {empresas.map((em) => (
                  <TableRow key={em.id} className={em.activa ? '' : 'opacity-60'}>
                    <TableCell className="font-medium">{em.nombre}</TableCell>
                    <TableCell className="font-mono-tabular">{em.rut ? formatearRut(em.rut) : '—'}</TableCell>
                    <TableCell>{em.propia ? 'Propia' : 'Contratista'}</TableCell>
                    <TableCell>
                      <Checkbox
                        checked={em.activa}
                        disabled={guardando || !editable || em.propia}
                        onCheckedChange={(v) => guardar(() => guardarEmpresa({ id: em.id, nombre: em.nombre, activa: !!v }), 'Empresa actualizada')}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface ItemVigencia {
  id: string
  nombre: string
  vigencia_meses: number | null
  activo: boolean
}

// Catálogo con vigencia en meses (vacía = no vence): lo comparten exámenes y capacitaciones.
function CatalogoVigencias({
  intro,
  placeholder,
  duplicado,
  items,
  loading,
  guardarItem,
  recargar,
}: {
  intro: string
  placeholder: string
  duplicado: string
  items: ItemVigencia[]
  loading: boolean
  guardarItem: (i: Partial<ItemVigencia> & { nombre: string }) => Promise<void>
  recargar: () => Promise<void>
}) {
  const { puede } = usePermisosSso('configuracion')
  const [nombre, setNombre] = useState('')
  const [meses, setMeses] = useState('12')
  const [guardando, setGuardando] = useState(false)
  const editable = puede('editar')

  const aMeses = (s: string) => (s.trim() === '' ? null : Math.max(1, Math.round(Number(s))))

  async function guardar(fn: () => Promise<unknown>, ok: string) {
    setGuardando(true)
    try {
      await fn()
      toast.success(ok)
      await recargar()
      return true
    } catch (err) {
      toast.error(mensaje(err, duplicado))
      return false
    } finally {
      setGuardando(false)
    }
  }

  async function onCrear(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    if (await guardar(() => guardarItem({ nombre: nombre.trim(), vigencia_meses: aMeses(meses) }), 'Tipo agregado')) {
      setNombre('')
      setMeses('12')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{intro}</p>
      {editable && (
        <Card>
          <CardContent className="pt-5">
            <form onSubmit={onCrear} className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
              <Input placeholder={placeholder} value={nombre} onChange={(e) => setNombre(e.target.value)} />
              <Input type="number" min={1} placeholder="Vigencia (meses)" value={meses} onChange={(e) => setMeses(e.target.value)} />
              <Button type="submit" disabled={guardando || !nombre.trim()}>
                Agregar tipo
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="w-48">Vigencia (meses)</TableHead>
                  <TableHead className="w-24">Activo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id} className={it.activo ? '' : 'opacity-60'}>
                    <TableCell className="font-medium">{it.nombre}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        className="h-8 w-28"
                        defaultValue={it.vigencia_meses ?? ''}
                        placeholder="No vence"
                        disabled={guardando || !editable}
                        onBlur={(e) => {
                          const v = aMeses(e.target.value)
                          if (v !== it.vigencia_meses) guardar(() => guardarItem({ id: it.id, nombre: it.nombre, vigencia_meses: v }), 'Vigencia actualizada')
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={it.activo}
                        disabled={guardando || !editable}
                        onCheckedChange={(v) => guardar(() => guardarItem({ id: it.id, nombre: it.nombre, activo: !!v }), 'Tipo actualizado')}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function TiposExamenConfig() {
  const { tiposExamen, recargar, loading } = useCatalogosTrabajadores()
  return (
    <CatalogoVigencias
      intro="La vigencia calcula el vencimiento de cada examen (se puede corregir examen por examen). Vacía = no vence. Los valores de partida son referenciales: ajústalos a lo que indique la mutual."
      placeholder="Nombre del examen"
      duplicado="Ya existe un tipo de examen con ese nombre"
      items={tiposExamen}
      loading={loading}
      guardarItem={guardarTipoExamen}
      recargar={recargar}
    />
  )
}

export function TiposCapacitacionConfig() {
  const [items, setItems] = useState<ItemVigencia[]>([])
  const [loading, setLoading] = useState(true)
  const recargar = useCallback(async () => {
    try {
      setItems(await listarTiposCapacitacion())
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    recargar()
  }, [recargar])
  return (
    <CatalogoVigencias
      intro="Con vigencia, la capacitación vence para cada asistente (ej. trabajo en altura cada 24 meses) y aparece en Vigencias. Vacía = no vence (charlas, inducción)."
      placeholder="Nombre de la capacitación"
      duplicado="Ya existe un tipo de capacitación con ese nombre"
      items={items}
      loading={loading}
      guardarItem={guardarTipoCapacitacion}
      recargar={recargar}
    />
  )
}

