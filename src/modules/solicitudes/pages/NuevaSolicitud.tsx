import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { useCatalogoGD, type Producto } from '@/modules/logistica/hooks/useCatalogoGD'
import ProductoAutocomplete from '@/modules/logistica/components/ProductoAutocomplete'
import { useAuth } from '../hooks/useAuth'
import { useGruposResponsables } from '../hooks/useGruposResponsables'
import { useSolicitudes, type ItemSolicitud } from '../hooks/useSolicitudes'
import { buildMailto, buildMailtoSubject, buildEmailHtmlTable, copyHtmlTableToClipboard, PROYECTO_CONST, WIP_CONST } from '../lib/email'

interface FilaSolicitud {
  id: number
  producto: Producto | null
  busqueda: string
  cantidadSol: string
  cantidadReal: string
  realDirty: boolean
  modulos: string
}

let rowSeq = 0
const filaVacia = (producto?: Producto): FilaSolicitud => ({
  id: ++rowSeq,
  producto: producto ?? null,
  busqueda: producto?.codigo ?? '',
  cantidadSol: producto ? '0' : '',
  cantidadReal: producto ? '0' : '',
  realDirty: false,
  modulos: '',
})

const MODULOS_ALERTA = 20

function syncModulos(cantidadReal: string, cpm: number | null): string {
  const real = parseFloat(cantidadReal)
  if (cpm == null || cpm <= 0 || isNaN(real) || real <= 0) return ''
  return (real / cpm).toFixed(2)
}

interface LastSaved {
  id: string
  numero: number
  grupoNombre: string
  responsableNombre: string
  items: ItemSolicitud[]
  observacion: string | null
}

const DRAFT_KEY_BASE = 'tecnopanel_solicitud_draft'

interface Draft {
  grupoId: string
  responsableId: string
  filas: FilaSolicitud[]
  observacion: string
}

function cargarDraft(key: string): Draft | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

async function cargarProductosGrupo(grupoId: number, allProducts: Producto[], cargarReceta: (id: number) => Promise<string[]>) {
  const codigos = await cargarReceta(grupoId)
  if (!codigos.length) return null
  const set = new Set(codigos.map((c) => c.toUpperCase()))
  return allProducts.filter((p) => set.has(p.codigo.toUpperCase())).sort((a, b) => a.descripcion.localeCompare(b.descripcion))
}

export default function NuevaSolicitud() {
  const { perfil, esRestringido } = useAuth()
  const grupoFijo = perfil?.grupoId ?? null
  const { allProducts } = useCatalogoGD()
  const { grupos, responsables, cargarReceta } = useGruposResponsables()
  const { crear, marcarUsada } = useSolicitudes()

  // Namespaced por usuario: sessionStorage sobrevive cambios de cuenta en la misma
  // pestaña/navegador, y un borrador de otro usuario no debe filtrarse al siguiente.
  const draftKey = `${DRAFT_KEY_BASE}_${perfil?.id ?? 'anon'}`

  const [draft] = useState(() => {
    const d = cargarDraft(draftKey)
    if (d?.filas?.length) rowSeq = Math.max(rowSeq, ...d.filas.map((f) => f.id))
    return d
  })

  const [grupoId, setGrupoId] = useState(draft?.grupoId ?? '')
  const [responsableId, setResponsableId] = useState(draft?.responsableId ?? '')
  const [filas, setFilas] = useState<FilaSolicitud[]>(draft?.filas?.length ? draft.filas : [filaVacia()])
  const [productosGrupo, setProductosGrupo] = useState<Producto[] | null>(null)
  const [intentoGuardar, setIntentoGuardar] = useState(false)
  const [observacion, setObservacion] = useState(draft?.observacion ?? '')
  const [enviando, setEnviando] = useState(false)
  const [lastSaved, setLastSaved] = useState<LastSaved | null>(null)

  const responsablesGrupo = useMemo(() => responsables.filter((r) => String(r.grupo_id) === grupoId), [responsables, grupoId])

  useEffect(() => {
    const data: Draft = { grupoId, responsableId, filas, observacion }
    sessionStorage.setItem(draftKey, JSON.stringify(data))
  }, [draftKey, grupoId, responsableId, filas, observacion])

  useEffect(() => {
    if (!grupoId || !allProducts.length || productosGrupo !== null) return
    cargarProductosGrupo(Number(grupoId), allProducts, cargarReceta).then(setProductosGrupo)
  }, [grupoId, allProducts, productosGrupo, cargarReceta])

  // Modo restringido: grupo fijo por perfil, sin selector manual. Se fuerza siempre
  // (no solo si grupoId está vacío) para no arrastrar un borrador de otra cuenta —
  // y se resetea productosGrupo para que se recargue la receta del grupo correcto.
  useEffect(() => {
    if (!esRestringido || !grupoFijo) return
    if (grupoId !== String(grupoFijo)) {
      setGrupoId(String(grupoFijo))
      setProductosGrupo(null)
    }
  }, [esRestringido, grupoFijo, grupoId])

  // Precarga toda la receta del grupo como filas fijas (solo cantidades editables).
  // Solo respeta un borrador guardado si es del mismo grupo fijo — evita arrastrar
  // filas de otro grupo si el borrador quedó de una sesión/cuenta distinta.
  useEffect(() => {
    if (!esRestringido || !productosGrupo) return
    if (draft?.grupoId === String(grupoFijo) && draft?.filas?.length) return
    setFilas(productosGrupo.length ? productosGrupo.map((p) => filaVacia(p)) : [])
  }, [esRestringido, productosGrupo, draft, grupoFijo])

  async function onGrupoChange(id: string) {
    setGrupoId(id)
    setResponsableId('')
    setFilas([filaVacia()])
    if (!id) {
      setProductosGrupo(null)
      return
    }
    setProductosGrupo(await cargarProductosGrupo(Number(id), allProducts, cargarReceta))
  }

  function onSelectProducto(id: number, p: Producto) {
    setFilas((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f
        const cantidadReal = f.realDirty ? f.cantidadReal : f.cantidadSol
        return { ...f, producto: p, busqueda: p.codigo, modulos: syncModulos(cantidadReal, p.cantidad_por_modulo) }
      }),
    )
  }

  function onCantSolChange(id: number, val: string) {
    setFilas((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f
        const cantidadReal = f.realDirty ? f.cantidadReal : val
        return { ...f, cantidadSol: val, cantidadReal, modulos: syncModulos(cantidadReal, f.producto?.cantidad_por_modulo ?? null) }
      }),
    )
  }

  function onCantRealChange(id: number, val: string) {
    setFilas((prev) =>
      prev.map((f) => (f.id === id ? { ...f, cantidadReal: val, realDirty: true, modulos: syncModulos(val, f.producto?.cantidad_por_modulo ?? null) } : f)),
    )
  }

  function onModulosChange(id: number, val: string) {
    setFilas((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f
        const cpm = f.producto?.cantidad_por_modulo ?? null
        const modulos = parseFloat(val)
        if (cpm == null || cpm <= 0 || isNaN(modulos)) return { ...f, modulos: val }
        const real = String(+(modulos * cpm).toFixed(2))
        return { ...f, modulos: val, cantidadSol: real, cantidadReal: real, realDirty: false }
      }),
    )
  }

  function quitarFila(id: number) {
    setFilas((prev) => {
      const resto = prev.filter((f) => f.id !== id)
      return resto.length ? resto : [filaVacia()]
    })
  }

  const itemsValidos = useMemo<ItemSolicitud[]>(
    () =>
      filas
        .filter((f) => f.producto && parseFloat(f.cantidadSol) > 0)
        .map((f) => {
          const cantidad = parseFloat(f.cantidadSol) || 0
          const cantidadRealRaw = parseFloat(f.cantidadReal) || 0
          return {
            codigo: f.producto!.codigo,
            descripcion: f.producto!.descripcion,
            unidad: f.producto!.unidad || 'UND',
            cantidad,
            cantidad_real: cantidadRealRaw > 0 ? cantidadRealRaw : cantidad,
            grupo: f.producto!.grupo || '',
            cantidad_por_modulo: f.producto!.cantidad_por_modulo,
          }
        }),
    [filas],
  )

  function limpiarItems() {
    setFilas(esRestringido && productosGrupo?.length ? productosGrupo.map((p) => filaVacia(p)) : [filaVacia()])
    setObservacion('')
    setIntentoGuardar(false)
    sessionStorage.removeItem(draftKey)
  }

  async function guardar() {
    setIntentoGuardar(true)
    if (!itemsValidos.length) {
      toast.error('Sin productos válidos')
      return
    }
    if (!grupoId) {
      toast.error('Selecciona el grupo solicitante')
      return
    }
    if (!esRestringido && !responsableId) {
      toast.error('Selecciona para quién se solicita')
      return
    }
    setEnviando(true)
    try {
      const grupo = grupos.find((g) => String(g.id) === grupoId)!
      const responsable = esRestringido ? null : responsables.find((r) => String(r.id) === responsableId)!
      const saved = await crear({
        usuario_id: perfil!.id,
        username: perfil!.username,
        nombre: perfil!.name,
        grupo_id: grupo.id,
        responsable_id: esRestringido ? grupo.responsable_default_id : responsable!.id,
        items: itemsValidos,
        observacion: observacion.trim() || null,
        estado: 'pendiente',
      })
      setIntentoGuardar(false)
      if (esRestringido) {
        limpiarItems()
        toast.success(`Solicitud N° ${saved.numero} guardada.`)
      } else {
        setLastSaved({ id: saved.id, numero: saved.numero, grupoNombre: grupo.nombre, responsableNombre: responsable!.nombre, items: itemsValidos, observacion: observacion.trim() || null })
        toast.success(`Solicitud N° ${saved.numero} guardada. Pulsa "Enviar correo" para completarla.`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setEnviando(false)
    }
  }

  async function enviarCorreo() {
    if (!lastSaved) return
    const html = buildEmailHtmlTable(lastSaved.numero, lastSaved.grupoNombre, lastSaved.responsableNombre, lastSaved.items, lastSaved.observacion)
    const copiado = await copyHtmlTableToClipboard(html)
    if (copiado) {
      const subject = buildMailtoSubject(lastSaved.numero, lastSaved.grupoNombre)
      const body = `N° Solicitud: ${lastSaved.numero}\nGrupo: ${lastSaved.grupoNombre}\nPara: ${lastSaved.responsableNombre}\n\n(Pega aquí la tabla copiada: Ctrl+V)`
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      toast.success('Tabla copiada al portapapeles. Pégala (Ctrl+V) en el cuerpo del correo.')
    } else {
      window.location.href = buildMailto(lastSaved.numero, lastSaved.grupoNombre, lastSaved.responsableNombre, lastSaved.items, lastSaved.observacion)
    }
    try {
      await marcarUsada(lastSaved.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo marcar como usada')
    }
    setLastSaved(null)
    limpiarItems()
    setGrupoId('')
    setResponsableId('')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Datos de la solicitud</div>
        <div className="flex flex-wrap gap-4">
          <div className="min-w-[200px] flex-1">
            <Label>Fecha Solicitud</Label>
            <div className="mt-1.5 rounded-md border bg-card px-3 py-2 text-sm">
              {new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <div className="min-w-[200px] flex-1">
            <Label>Usuario que solicita</Label>
            <div className="mt-1.5 rounded-md border bg-card px-3 py-2 text-sm">{perfil?.name}</div>
          </div>
          <div className="min-w-[200px] flex-1">
            <Label>Grupo solicitante *</Label>
            {esRestringido ? (
              <div className="mt-1.5 rounded-md border bg-card px-3 py-2 text-sm">
                {grupos.find((g) => String(g.id) === grupoId)?.nombre ?? '—'}
              </div>
            ) : (
              <Select value={grupoId} onValueChange={onGrupoChange}>
                <SelectTrigger className={`mt-1.5 min-w-[180px] ${intentoGuardar && !grupoId ? 'border-destructive' : ''}`}>
                  <SelectValue placeholder="Selecciona grupo…" />
                </SelectTrigger>
                <SelectContent>
                  {grupos.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {!esRestringido && (
            <div className="min-w-[200px] flex-1">
              <Label>Para quién se solicita *</Label>
              <Select value={responsableId} onValueChange={setResponsableId} disabled={!grupoId}>
                <SelectTrigger className={`mt-1.5 min-w-[180px] ${intentoGuardar && !responsableId ? 'border-destructive' : ''}`}>
                  <SelectValue placeholder={grupoId ? 'Selecciona responsable…' : 'Selecciona grupo primero…'} />
                </SelectTrigger>
                <SelectContent>
                  {responsablesGrupo.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-md border p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Productos solicitados</div>
        {!grupoId ? (
          <p className="mb-2 text-xs text-muted-foreground">Selecciona un grupo para ver sus productos habituales.</p>
        ) : esRestringido && productosGrupo != null && productosGrupo.length === 0 ? (
          <p className="mb-2 text-xs text-muted-foreground">Tu grupo aún no tiene una receta de productos cargada. Avisa a un administrador.</p>
        ) : null}
        <div className={`grid ${esRestringido ? 'grid-cols-[150px_1fr_60px_75px_75px_75px]' : 'grid-cols-[150px_1fr_60px_75px_75px_75px_36px]'} items-center gap-2 px-1 pb-1 text-[11px] font-medium text-muted-foreground`}>
          <div>Código{esRestringido ? '' : ' (o buscar)'}</div>
          <div>Descripción</div>
          <div className="text-center">Unidad</div>
          <div className="text-center">Cant. Sol.</div>
          <div className="text-center">Cant. Real</div>
          <div className="text-center">Módulos</div>
          {!esRestringido && <div />}
        </div>
        <div className="space-y-2">
          {filas.map((f) => (
            <div key={f.id} className={`grid ${esRestringido ? 'grid-cols-[150px_1fr_60px_75px_75px_75px]' : 'grid-cols-[150px_1fr_60px_75px_75px_75px_36px]'} items-center gap-2`}>
              {esRestringido ? (
                <div className="truncate font-mono text-xs text-primary">{f.producto?.codigo}</div>
              ) : (
                <ProductoAutocomplete
                  value={f.busqueda}
                  productos={productosGrupo ?? allProducts}
                  placeholder="Código o descripción…"
                  onChange={(v) => setFilas((prev) => prev.map((row) => (row.id === f.id ? { ...row, busqueda: v, producto: null } : row)))}
                  onSelect={(p) => onSelectProducto(f.id, p)}
                />
              )}
              <div className="truncate text-sm">{f.producto?.descripcion || ''}</div>
              <div className="text-center text-xs text-muted-foreground">{f.producto?.unidad || '—'}</div>
              <Input type="number" min="0" step="1" placeholder="0" value={f.cantidadSol} onChange={(e) => onCantSolChange(f.id, e.target.value)} title="Cant. Solicitada" />
              <Input type="number" min="0" step="1" placeholder="0" value={f.cantidadReal} onChange={(e) => onCantRealChange(f.id, e.target.value)} title="Cant. Real (va al correo)" />
              <Input
                type="number"
                min="0"
                step="any"
                placeholder={f.producto?.cantidad_por_modulo ? '0' : '—'}
                disabled={!f.producto?.cantidad_por_modulo}
                value={f.modulos}
                onChange={(e) => onModulosChange(f.id, e.target.value)}
                title="Módulos: calcula la Cant. Real"
              />
              {!esRestringido && (
                <Button type="button" variant="ghost" size="icon" onClick={() => quitarFila(f.id)} title="Eliminar">
                  ✕
                </Button>
              )}
            </div>
          ))}
        </div>
        {!esRestringido && (
          <Button type="button" variant="outline" size="sm" className="mt-3 w-full border-dashed" onClick={() => setFilas((prev) => [...prev, filaVacia()])}>
            + Agregar producto
          </Button>
        )}
      </div>

      <div className="rounded-md border p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumen y envío</div>
        {itemsValidos.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Agrega productos arriba para ver el resumen.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>WIP</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-center">Cant. Sol.</TableHead>
                  <TableHead className="text-center">Cant. Real</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead className="text-center">Módulos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsValidos.map((it, i) => {
                  const modulos = it.cantidad_por_modulo != null && it.cantidad_por_modulo > 0 ? it.cantidad_real / it.cantidad_por_modulo : null
                  const alerta = modulos != null && modulos > MODULOS_ALERTA
                  return (
                    <TableRow key={it.codigo + i}>
                      <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{PROYECTO_CONST}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{WIP_CONST}</TableCell>
                      <TableCell className="font-mono text-xs text-primary">{it.codigo}</TableCell>
                      <TableCell className="text-sm">{it.descripcion}</TableCell>
                      <TableCell className="text-center">{it.cantidad}</TableCell>
                      <TableCell className="text-center">{it.cantidad_real}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{it.unidad}</TableCell>
                      <TableCell className={`text-center font-semibold ${alerta ? 'text-destructive' : 'text-primary'}`}>
                        {alerta ? '⚠ ' : ''}
                        {modulos != null ? modulos.toFixed(2) : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="mt-4">
          <Label htmlFor="obs-solicitud">Observaciones (opcional)</Label>
          <Textarea
            id="obs-solicitud"
            className="mt-1.5"
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="Instrucciones especiales, urgencia, destino, etc."
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={limpiarItems}>
          🗑 Limpiar
        </Button>
        {lastSaved ? (
          <Button type="button" onClick={enviarCorreo}>
            ✉ Enviar correo
          </Button>
        ) : (
          <Button type="button" onClick={guardar} disabled={enviando}>
            {enviando ? 'Guardando…' : '💾 Guardar solicitud'}
          </Button>
        )}
      </div>
    </div>
  )
}
