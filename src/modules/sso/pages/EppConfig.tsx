import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { CATEGORIAS_EPP, guardarElementoEpp, listarCatalogoEpp, type CategoriaEpp, type ElementoEpp } from '../lib/apiEpp'
import { usePermisosSso } from '../hooks/usePermisosSso'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'
const CATEGORIA = Object.fromEntries(CATEGORIAS_EPP.map((c) => [c.key, c.label])) as Record<string, string>

/** Catálogo de EPP: categoría, vida útil (para calcular la reposición) y si se entrega con talla. */
export default function EppConfig() {
  const { puede } = usePermisosSso('configuracion')
  const editable = puede('editar')
  const [items, setItems] = useState<ElementoEpp[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState<CategoriaEpp>('manos')
  const [meses, setMeses] = useState('12')
  const [talla, setTalla] = useState(false)

  const recargar = useCallback(async () => {
    try {
      setItems(await listarCatalogoEpp())
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    recargar()
  }, [recargar])

  const aMeses = (s: string) => (s.trim() === '' ? null : Math.max(1, Math.round(Number(s))))

  async function guardar(fn: () => Promise<unknown>, ok: string) {
    setGuardando(true)
    try {
      await fn()
      toast.success(ok)
      await recargar()
      return true
    } catch (err) {
      const m = err instanceof Error ? err.message : 'No se pudo guardar'
      toast.error(m.includes('duplicate') ? 'Ya existe un elemento con ese nombre' : m)
      return false
    } finally {
      setGuardando(false)
    }
  }

  async function onCrear(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    if (await guardar(() => guardarElementoEpp({ nombre: nombre.trim(), categoria, vida_util_meses: aMeses(meses), requiere_talla: talla }), 'Elemento agregado')) {
      setNombre('')
      setTalla(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        La vida útil calcula cuándo reponer cada elemento desde su entrega (vacía = solo por deterioro o pérdida). Los valores de
        partida son referenciales: ajústalos según el fabricante y el uso real.
      </p>
      {editable && (
        <Card>
          <CardContent className="pt-5">
            <form onSubmit={onCrear} className="grid items-center gap-2 sm:grid-cols-[1fr_170px_140px_auto_auto]">
              <Input placeholder="Nombre del elemento" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaEpp)} className={selectClase} aria-label="Categoría">
                {CATEGORIAS_EPP.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              <Input type="number" min={1} placeholder="Vida útil (meses)" value={meses} onChange={(e) => setMeses(e.target.value)} />
              <label className="flex items-center gap-2 whitespace-nowrap text-sm">
                <Checkbox checked={talla} onCheckedChange={(v) => setTalla(!!v)} /> Lleva talla
              </label>
              <Button type="submit" disabled={guardando || !nombre.trim()}>
                Agregar
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
                  <TableHead>Elemento</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="w-40">Vida útil (meses)</TableHead>
                  <TableHead className="w-24">Talla</TableHead>
                  <TableHead className="w-24">Activo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id} className={it.activo ? '' : 'opacity-60'}>
                    <TableCell className="font-medium">{it.nombre}</TableCell>
                    <TableCell>{CATEGORIA[it.categoria]}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        className="h-8 w-28"
                        defaultValue={it.vida_util_meses ?? ''}
                        placeholder="Deterioro"
                        disabled={guardando || !editable}
                        onBlur={(e) => {
                          const v = aMeses(e.target.value)
                          if (v !== it.vida_util_meses) guardar(() => guardarElementoEpp({ id: it.id, nombre: it.nombre, vida_util_meses: v }), 'Vida útil actualizada')
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={it.requiere_talla}
                        disabled={guardando || !editable}
                        onCheckedChange={(v) => guardar(() => guardarElementoEpp({ id: it.id, nombre: it.nombre, requiere_talla: !!v }), 'Actualizado')}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={it.activo}
                        disabled={guardando || !editable}
                        onCheckedChange={(v) => guardar(() => guardarElementoEpp({ id: it.id, nombre: it.nombre, activo: !!v }), 'Actualizado')}
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
