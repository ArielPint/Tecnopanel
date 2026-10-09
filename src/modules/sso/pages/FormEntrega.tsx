import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, RefreshCw, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  CATEGORIAS_EPP,
  MOTIVOS_ENTREGA,
  guardarEntrega,
  listarCatalogoEpp,
  listarEppVigentes,
  listarItems,
  obtenerEntrega,
  subirComprobante,
  type ElementoEpp,
  type EntregaV,
  type EppVigente,
  type FichaEntrega,
  type MotivoEntrega,
} from '../lib/apiEpp'
import { listarTrabajadores } from '../lib/apiTrabajadores'
import { fmtFecha, hoyChile } from '../lib/estados'
import { formatearRut } from '../lib/rut'
import { RUTA } from '../lib/rutas'
import type { TrabajadorV } from '../lib/tiposTrabajadores'
import { usePermisosSso } from '../hooks/usePermisosSso'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'
const TIPOS_COMPROBANTE = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

interface Linea {
  epp_id: string
  cantidad: number
  talla: string
}

/** Alta (/epp/nueva[?trabajador=]) y edición (/epp/:id/editar) de una entrega. */
export default function FormEntrega() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { puede, userId, loading: permisosLoading } = usePermisosSso('epp')

  const [catalogo, setCatalogo] = useState<ElementoEpp[]>([])
  const [trabajadores, setTrabajadores] = useState<TrabajadorV[]>([])
  const [original, setOriginal] = useState<EntregaV | null>(null)
  const [ficha, setFicha] = useState<FichaEntrega>({ trabajador_id: params.get('trabajador') ?? '', fecha: hoyChile(), motivo: 'primera', observaciones: null })
  const [lineas, setLineas] = useState<Linea[]>([])
  const [vigentes, setVigentes] = useState<EppVigente[]>([])
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [buscar, setBuscar] = useState('')
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    Promise.all([listarCatalogoEpp(), listarTrabajadores(), id ? obtenerEntrega(id) : null, id ? listarItems([id]) : []])
      .then(([cat, tr, ent, its]) => {
        setCatalogo(cat)
        setTrabajadores(tr)
        if (ent) {
          setOriginal(ent)
          setFicha({ trabajador_id: ent.trabajador_id, fecha: ent.fecha, motivo: ent.motivo, observaciones: ent.observaciones })
          setLineas(its.map((i) => ({ epp_id: i.epp_id, cantidad: i.cantidad, talla: i.talla ?? '' })))
        }
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setCargando(false))
  }, [id])

  // lo que ya tiene el trabajador: para ver qué toca reponer y sugerir tallas
  useEffect(() => {
    if (!ficha.trabajador_id) {
      setVigentes([])
      return
    }
    listarEppVigentes(ficha.trabajador_id).then(setVigentes).catch(() => setVigentes([]))
  }, [ficha.trabajador_id])

  const cat = useMemo(() => new Map(catalogo.map((c) => [c.id, c])), [catalogo])
  const trabajador = trabajadores.find((t) => t.id === ficha.trabajador_id)
  const pendientes = vigentes.filter((v) => v.situacion !== 'vigente' && v.entrega_id !== id)

  const candidatos = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    const qRut = buscar.replace(/[^0-9kK]/g, '')
    if (!q) return []
    return trabajadores
      .filter((t) => t.activo && (`${t.nombres} ${t.apellidos}`.toLowerCase().includes(q) || (qRut.length >= 3 && t.rut.replace('-', '').includes(qRut))))
      .slice(0, 8)
  }, [trabajadores, buscar])

  const puedeGuardar = id ? puede('editar') || (original?.entregado_por === userId && puede('crear')) : puede('crear')
  if (!permisosLoading && !cargando && !puedeGuardar) return <Navigate to={id ? RUTA.entrega(id) : RUTA.epp} replace />

  const tallaAnterior = (eppId: string) => vigentes.find((v) => v.epp_id === eppId)?.talla ?? ''
  const agregarLinea = (eppId = '') => setLineas((ls) => [...ls, { epp_id: eppId, cantidad: 1, talla: eppId ? tallaAnterior(eppId) : '' }])
  const setLinea = (i: number, cambio: Partial<Linea>) =>
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambio, ...(cambio.epp_id ? { talla: l.talla || tallaAnterior(cambio.epp_id) } : {}) } : l)))

  function agregarPendientes() {
    const ya = new Set(lineas.map((l) => l.epp_id))
    const nuevas = pendientes
      .filter((p) => !ya.has(p.epp_id) && cat.get(p.epp_id)?.activo)
      .map((p) => ({ epp_id: p.epp_id, cantidad: p.cantidad, talla: p.talla ?? '' }))
    setLineas((ls) => [...ls.filter((l) => l.epp_id), ...nuevas])
    setFicha((f) => ({ ...f, motivo: 'reposicion' }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!ficha.trabajador_id) {
      toast.error('Elige el trabajador')
      return
    }
    const validas = lineas.filter((l) => l.epp_id)
    if (validas.length === 0) {
      toast.error('Agrega al menos un elemento')
      return
    }
    if (new Set(validas.map((l) => l.epp_id)).size !== validas.length) {
      toast.error('Hay un elemento repetido: súmalo en una sola línea')
      return
    }
    const sinTalla = validas.find((l) => cat.get(l.epp_id)?.requiere_talla && !l.talla.trim())
    if (sinTalla) {
      toast.error(`Indica la talla de "${cat.get(sinTalla.epp_id)?.nombre}"`)
      return
    }
    if (comprobante && !TIPOS_COMPROBANTE.includes(comprobante.type)) {
      toast.error('El comprobante debe ser PDF o foto')
      return
    }
    setEnviando(true)
    try {
      const entregaId = await guardarEntrega(
        id ?? null,
        { ...ficha, observaciones: ficha.observaciones?.trim() || null },
        validas.map((l) => ({ epp_id: l.epp_id, cantidad: l.cantidad, talla: l.talla.trim() || null })),
      )
      if (comprobante) {
        try {
          await subirComprobante({ id: entregaId, comprobante_path: original?.comprobante_path ?? null }, comprobante)
        } catch (err) {
          toast.warning(`Entrega guardada, pero el comprobante no se pudo subir: ${err instanceof Error ? err.message : ''}`)
        }
      }
      toast.success(id ? 'Entrega actualizada' : 'Entrega registrada')
      navigate(RUTA.entrega(entregaId), { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
      setEnviando(false)
    }
  }

  if (cargando) return <div className="h-40 animate-pulse rounded bg-muted" />

  const activos = catalogo.filter((c) => c.activo)

  return (
    <div className="space-y-4">
      <Link to={id ? RUTA.entrega(id) : RUTA.epp} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {id ? 'Volver a la entrega' : 'Volver a entregas'}
      </Link>
      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <h1 className="text-lg font-extrabold">{id ? 'Editar entrega de EPP' : 'Registrar entrega de EPP'}</h1>

            <div className="flex flex-col gap-1.5">
              <Label>Trabajador *</Label>
              {trabajador ? (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <span className="flex-1">
                    <span className="font-semibold">
                      {trabajador.apellidos}, {trabajador.nombres}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatearRut(trabajador.rut)} · {trabajador.cargo ?? 'sin cargo'} · {trabajador.empresa}
                    </span>
                  </span>
                  {!id && (
                    <button type="button" onClick={() => setFicha((f) => ({ ...f, trabajador_id: '' }))} className="text-muted-foreground hover:text-foreground" aria-label="Cambiar trabajador">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar por nombre o RUT" value={buscar} onChange={(e) => setBuscar(e.target.value)} className="pl-8" autoFocus />
                  {candidatos.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full divide-y rounded-md border bg-popover shadow-lg">
                      {candidatos.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() => {
                              setFicha((f) => ({ ...f, trabajador_id: t.id }))
                              setBuscar('')
                            }}
                          >
                            {t.apellidos}, {t.nombres}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {t.cargo ?? 'sin cargo'} · {t.empresa}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {trabajador && pendientes.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
                <p className="font-semibold">Le toca reponer:</p>
                <ul className="mt-1 text-xs">
                  {pendientes.map((p) => (
                    <li key={p.epp_id}>
                      {cat.get(p.epp_id)?.nombre ?? 'Elemento'} — entregado {fmtFecha(p.fecha)}, {p.situacion === 'vencido' ? 'vencido el' : 'vence el'} {fmtFecha(p.reposicion)}
                    </li>
                  ))}
                </ul>
                <Button type="button" size="sm" variant="outline" className="mt-2" onClick={agregarPendientes}>
                  <RefreshCw className="mr-1 h-4 w-4" /> Agregar lo que toca reponer
                </Button>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="e-fecha">Fecha *</Label>
                <Input id="e-fecha" type="date" value={ficha.fecha} max={hoyChile()} onChange={(e) => setFicha((f) => ({ ...f, fecha: e.target.value }))} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="e-motivo">Motivo *</Label>
                <select id="e-motivo" value={ficha.motivo} onChange={(e) => setFicha((f) => ({ ...f, motivo: e.target.value as MotivoEntrega }))} className={selectClase}>
                  {MOTIVOS_ENTREGA.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="text-sm font-bold">Elementos entregados</p>
            {lineas.length === 0 && <p className="text-sm text-muted-foreground">Agrega los elementos que se entregaron.</p>}
            {lineas.map((l, i) => {
              const el = cat.get(l.epp_id)
              return (
                <div key={i} className="grid grid-cols-[1fr_80px_100px_auto] items-center gap-2">
                  <select value={l.epp_id} onChange={(e) => setLinea(i, { epp_id: e.target.value })} className={selectClase} aria-label="Elemento">
                    <option value="">Elegir…</option>
                    {CATEGORIAS_EPP.map((c) => {
                      const items = catalogo.filter((x) => x.categoria === c.key && (x.activo || x.id === l.epp_id))
                      return items.length ? (
                        <optgroup key={c.key} label={c.label}>
                          {items.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.nombre}
                            </option>
                          ))}
                        </optgroup>
                      ) : null
                    })}
                  </select>
                  <Input type="number" min={1} max={100} value={l.cantidad} onChange={(e) => setLinea(i, { cantidad: Math.max(1, Number(e.target.value) || 1) })} aria-label="Cantidad" />
                  <Input
                    value={l.talla}
                    onChange={(e) => setLinea(i, { talla: e.target.value })}
                    placeholder={el?.requiere_talla ? 'Talla *' : 'Talla'}
                    className={cn(el?.requiere_talla && !l.talla && 'border-amber-500')}
                    aria-label="Talla"
                  />
                  <button type="button" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Quitar">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
            <Button type="button" size="sm" variant="outline" onClick={() => agregarLinea()} disabled={activos.length === 0}>
              <Plus className="mr-1 h-4 w-4" /> Agregar elemento
            </Button>

            <div className="flex flex-col gap-1.5 pt-2">
              <Label htmlFor="e-obs">Observaciones</Label>
              <Textarea id="e-obs" rows={2} value={ficha.observaciones ?? ''} onChange={(e) => setFicha((f) => ({ ...f, observaciones: e.target.value || null }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-comp">
                Comprobante firmado por el trabajador (foto o PDF)
                {original?.comprobante_nombre && <span className="ml-1 font-normal text-muted-foreground">· actual: {original.comprobante_nombre} (se reemplaza si eliges otro)</span>}
              </Label>
              <Input id="e-comp" type="file" accept={TIPOS_COMPROBANTE.join(',')} onChange={(e) => setComprobante(e.target.files?.[0] ?? null)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : id ? 'Guardar cambios' : 'Registrar entrega'}
          </Button>
        </div>
      </form>
    </div>
  )
}
