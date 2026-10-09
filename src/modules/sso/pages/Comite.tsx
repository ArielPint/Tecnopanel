import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom'
import { AlertTriangle, FileSpreadsheet, Pencil, Plus, Trash2, UserMinus } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { cn } from '@/lib/utils'
import {
  ESTADO_ACUERDO,
  abierto,
  eliminarAcuerdo,
  eliminarMiembro,
  errorMiembro,
  exportarAcuerdos,
  guardarComite,
  guardarMiembro,
  listarAcuerdos,
  listarComites,
  listarMiembros,
  listarReuniones,
  listarResponsablesComite,
  type AcuerdoV,
  type CargoComite,
  type Calidad,
  type ComiteV,
  type FichaComite,
  type MiembroV,
  type Representa,
  type ReunionV,
} from '../lib/apiComite'
import { listarTrabajadores } from '../lib/apiTrabajadores'
import type { TrabajadorV } from '../lib/tiposTrabajadores'
import type { UsuarioSso } from '../lib/tipos'
import { fmtFecha, hoyChile } from '../lib/estados'
import { RUTA } from '../lib/rutas'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'
import { DialogAcuerdo } from '../components/DialogAcuerdo'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'
const CLAVE_SEL = 'sso-comite-seleccionado'

interface CtxComite {
  comite: ComiteV
  recargarComites: () => void
}
const useComite = () => useOutletContext<CtxComite>()

const diasDesde = (f: string) => {
  const h = hoyChile()
  return Math.round((Date.UTC(+h.slice(0, 4), +h.slice(5, 7) - 1, +h.slice(8, 10)) - Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10))) / 86_400_000)
}
const sumarAnios = (f: string, n: number) => `${+f.slice(0, 4) + n}${f.slice(4)}`

function Pestana({ to, children, end }: { to: string; children: React.ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
        )
      }
    >
      {children}
    </NavLink>
  )
}

/** Contenedor: elige el comité (si hay más de uno) y lo pasa a las pestañas. */
export function ModuloComite() {
  const { puede } = usePermisosSso('comite')
  const [comites, setComites] = useState<ComiteV[]>([])
  const [selId, setSelId] = useState<string>(() => {
    try {
      return localStorage.getItem(CLAVE_SEL) ?? ''
    } catch {
      return ''
    }
  })
  const [loading, setLoading] = useState(true)
  const [dialogo, setDialogo] = useState<'nuevo' | 'editar' | null>(null)

  const recargarComites = useCallback(() => {
    listarComites()
      .then(setComites)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(recargarComites, [recargarComites])

  const comite = comites.find((c) => c.id === selId) ?? comites[0] ?? null
  const elegir = (id: string) => {
    setSelId(id)
    try {
      localStorage.setItem(CLAVE_SEL, id)
    } catch {
      /* sin almacenamiento: se elige de nuevo la próxima vez */
    }
  }

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />

  const sinOrdinaria = comite && comite.activo && (!comite.ultima_ordinaria || diasDesde(comite.ultima_ordinaria) > 31)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold">Comité Paritario</h1>
          <p className="text-sm text-muted-foreground">Comité Paritario de Higiene y Seguridad (DS 54): integrantes, reuniones, actas y acuerdos.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {comites.length > 1 && (
            <select value={comite?.id ?? ''} onChange={(e) => elegir(e.target.value)} className={cn(selectClase, 'w-auto')} aria-label="Comité">
              {comites.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {!c.activo ? ' (inactivo)' : ''}
                </option>
              ))}
            </select>
          )}
          {puede('editar') && comite && (
            <Button size="sm" variant="outline" onClick={() => setDialogo('editar')}>
              <Pencil className="mr-1 h-4 w-4" /> Comité
            </Button>
          )}
          {puede('editar') && (
            <Button size="sm" variant="outline" onClick={() => setDialogo('nuevo')}>
              <Plus className="mr-1 h-4 w-4" /> Nuevo comité
            </Button>
          )}
          {puede('crear') && comite && (
            <Button asChild size="sm">
              <Link to={RUTA.nuevaReunion(comite.id)}>
                <Plus className="mr-1 h-4 w-4" /> Registrar reunión
              </Link>
            </Button>
          )}
        </div>
      </div>

      {!comite ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {puede('editar') ? 'Todavía no hay comités. Crea el primero con "Nuevo comité".' : 'Todavía no hay comités registrados.'}
        </p>
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-4 pt-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Periodo</p>
                <p className={cn(comite.periodo_vencido && 'font-semibold text-red-700 dark:text-red-400')}>
                  {fmtFecha(comite.periodo_desde)} – {fmtFecha(comite.periodo_hasta)}
                  {comite.periodo_vencido && ' · vencido: corresponde renovar'}
                </p>
                {comite.faena && <p className="text-xs text-muted-foreground">{comite.faena}</p>}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Titulares</p>
                <p>
                  Empresa {comite.titulares_empresa}/3 · Trabajadores {comite.titulares_trabajadores}/3
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Última ordinaria</p>
                <p className={cn(sinOrdinaria && 'font-semibold text-red-700 dark:text-red-400')}>
                  {comite.ultima_ordinaria ? `${fmtFecha(comite.ultima_ordinaria)} (hace ${diasDesde(comite.ultima_ordinaria)} días)` : 'Sin reuniones'}
                </p>
                {comite.proxima_reunion && <p className="text-xs text-muted-foreground">Próxima: {fmtFecha(comite.proxima_reunion)}</p>}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Acuerdos abiertos</p>
                <p>
                  {comite.acuerdos_pendientes}
                  {comite.acuerdos_vencidos > 0 && <span className="font-semibold text-red-700 dark:text-red-400"> · {comite.acuerdos_vencidos} vencidos</span>}
                </p>
              </div>
            </CardContent>
          </Card>
          {sinOrdinaria && (
            <p className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4 shrink-0" /> El comité debe reunirse en forma ordinaria una vez al mes.
            </p>
          )}
          <nav className="flex gap-1 border-b">
            <Pestana to={RUTA.comite} end>
              Reuniones
            </Pestana>
            <Pestana to={RUTA.acuerdosComite}>Acuerdos</Pestana>
            <Pestana to={RUTA.integrantesComite}>Integrantes</Pestana>
          </nav>
          <Outlet context={{ comite, recargarComites } satisfies CtxComite} />
        </>
      )}

      <DialogComite
        open={dialogo !== null}
        onOpenChange={(v) => !v && setDialogo(null)}
        comite={dialogo === 'editar' ? comite : null}
        onGuardado={(id) => {
          elegir(id)
          recargarComites()
        }}
      />
    </div>
  )
}

function DialogComite({ open, onOpenChange, comite, onGuardado }: { open: boolean; onOpenChange: (v: boolean) => void; comite: ComiteV | null; onGuardado: (id: string) => void }) {
  const [f, setF] = useState<FichaComite>({ nombre: '', faena: null, periodo_desde: hoyChile(), periodo_hasta: sumarAnios(hoyChile(), 2), activo: true, observaciones: null })
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!open) return
    const hoy = hoyChile()
    setF(
      comite
        ? { nombre: comite.nombre, faena: comite.faena, periodo_desde: comite.periodo_desde, periodo_hasta: comite.periodo_hasta, activo: comite.activo, observaciones: comite.observaciones }
        : { nombre: '', faena: null, periodo_desde: hoy, periodo_hasta: sumarAnios(hoy, 2), activo: true, observaciones: null },
    )
  }, [open, comite])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!f.nombre.trim()) return
    setEnviando(true)
    try {
      const id = await guardarComite(comite?.id ?? null, { ...f, nombre: f.nombre.trim(), faena: f.faena?.trim() || null, observaciones: f.observaciones?.trim() || null })
      toast.success(comite ? 'Comité actualizado' : 'Comité creado')
      onGuardado(id)
      onOpenChange(false)
    } catch (err) {
      const m = err instanceof Error ? err.message : 'No se pudo guardar'
      toast.error(m.includes('duplicate') ? 'Ya existe un comité con ese nombre' : m)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{comite ? 'Editar comité' : 'Nuevo comité'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="co-nombre">Nombre *</Label>
            <Input id="co-nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="CPHS Planta Santiago" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="co-faena">Faena / sucursal</Label>
            <Input id="co-faena" value={f.faena ?? ''} onChange={(e) => setF({ ...f, faena: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="co-desde">Periodo desde *</Label>
              <Input
                id="co-desde"
                type="date"
                value={f.periodo_desde}
                onChange={(e) => setF({ ...f, periodo_desde: e.target.value, periodo_hasta: comite ? f.periodo_hasta : sumarAnios(e.target.value, 2) })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="co-hasta">Hasta *</Label>
              <Input id="co-hasta" type="date" value={f.periodo_hasta} min={f.periodo_desde} onChange={(e) => setF({ ...f, periodo_hasta: e.target.value })} required />
            </div>
          </div>
          <p className="-mt-1 text-[11px] text-muted-foreground">Los integrantes duran 2 años en sus funciones.</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="co-obs">Observaciones</Label>
            <Textarea id="co-obs" rows={2} value={f.observaciones ?? ''} onChange={(e) => setF({ ...f, observaciones: e.target.value })} />
          </div>
          {comite && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={f.activo} onCheckedChange={(v) => setF({ ...f, activo: !!v })} /> Comité activo
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- Reuniones

export function ReunionesComite() {
  const { comite } = useComite()
  const navigate = useNavigate()
  const [reuniones, setReuniones] = useState<ReunionV[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listarReuniones(comite.id)
      .then(setReuniones)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [comite.id])

  if (loading) return <div className="h-24 animate-pulse rounded bg-muted" />
  if (reuniones.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">Todavía no hay reuniones registradas.</p>

  return (
    <Card>
      <CardContent className="pt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Temas</TableHead>
              <TableHead>Asistencia</TableHead>
              <TableHead>Acta</TableHead>
              <TableHead>Acuerdos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reuniones.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(RUTA.reunion(r.id))}>
                <TableCell className="font-mono-tabular font-semibold">{r.numero}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {fmtFecha(r.fecha)}
                  {r.estado === 'programada' && <span className="ml-2 rounded-full bg-sky-100 px-2 text-[11px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">programada</span>}
                </TableCell>
                <TableCell className="capitalize">{r.tipo}</TableCell>
                <TableCell className="max-w-xs truncate">{r.temas || '—'}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.estado === 'realizada' ? (
                    <>
                      {r.presentes} presentes
                      {!r.quorum && <span className="ml-2 text-xs font-semibold text-red-700 dark:text-red-400">sin quórum</span>}
                    </>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>{r.acta_path ? 'Firmada' : r.desarrollo ? 'Texto' : r.estado === 'realizada' ? <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Falta</span> : '—'}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.acuerdos}
                  {r.acuerdos_pendientes > 0 && <span className="text-xs text-muted-foreground"> ({r.acuerdos_pendientes} abiertos)</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- Acuerdos

/** Tabla de acuerdos con sus acciones; la usan la pestaña Acuerdos y el detalle de la reunión. */
export function TablaAcuerdos({
  acuerdos,
  comiteId,
  reunionId,
  onCambio,
  mostrarReunion,
}: {
  acuerdos: AcuerdoV[]
  comiteId: string
  reunionId: string | null
  onCambio: () => void
  mostrarReunion: boolean
}) {
  const { puede, userId } = usePermisosSso('comite')
  const { nombreUsuario } = useDatosSso()
  const [responsables, setResponsables] = useState<UsuarioSso[]>([])
  const [dialogo, setDialogo] = useState<{ acuerdo: AcuerdoV | null; modo: 'completo' | 'avance' } | null>(null)

  useEffect(() => {
    listarResponsablesComite()
      .then(setResponsables)
      .catch(() => setResponsables([]))
  }, [])

  const editaTodo = (a: AcuerdoV) => puede('editar') || (a.creado_por === userId && puede('crear'))

  async function borrar(a: AcuerdoV) {
    if (!window.confirm('¿Eliminar este acuerdo? Lo normal es marcarlo como anulado.')) return
    try {
      await eliminarAcuerdo(a.id)
      toast.success('Acuerdo eliminado')
      onCambio()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <>
      {puede('crear') && (
        <div className="mb-2 flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setDialogo({ acuerdo: null, modo: 'completo' })}>
            <Plus className="mr-1 h-4 w-4" /> Nuevo acuerdo
          </Button>
        </div>
      )}
      {acuerdos.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Sin acuerdos.</p>
      ) : (
        <ul className="divide-y">
          {acuerdos.map((a) => (
            <li key={a.id} className={cn('flex flex-wrap items-start gap-3 py-3', a.estado === 'anulado' && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', a.estado === 'anulado' && 'line-through')}>{a.descripcion}</p>
                <p className="text-xs text-muted-foreground">
                  {mostrarReunion && a.reunion_numero && (
                    <>
                      <Link to={RUTA.reunion(a.reunion_id!)} className="hover:underline">
                        Reunión N° {a.reunion_numero}
                      </Link>{' '}
                      ·{' '}
                    </>
                  )}
                  Responsable: {a.responsable_user_id ? nombreUsuario(a.responsable_user_id) : a.responsable_nombre}
                  {a.fecha_compromiso && ` · plazo ${fmtFecha(a.fecha_compromiso)}`}
                  {a.fecha_cumplimiento && ` · cumplido ${fmtFecha(a.fecha_cumplimiento)}`}
                </p>
                {a.avance && <p className="mt-1 whitespace-pre-wrap text-xs">{a.avance}</p>}
              </div>
              <div className="flex items-center gap-1">
                {a.vencido && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">Vencido {a.dias_atraso} d</span>}
                <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', ESTADO_ACUERDO[a.estado].clase)}>{ESTADO_ACUERDO[a.estado].label}</span>
                {editaTodo(a) ? (
                  <Button size="icon" variant="ghost" title="Editar" onClick={() => setDialogo({ acuerdo: a, modo: 'completo' })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                ) : (
                  a.responsable_user_id === userId &&
                  a.estado !== 'anulado' && (
                    <Button size="sm" variant="outline" onClick={() => setDialogo({ acuerdo: a, modo: 'avance' })}>
                      Informar avance
                    </Button>
                  )
                )}
                {puede('eliminar') && (
                  <Button size="icon" variant="ghost" title="Eliminar" onClick={() => borrar(a)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <DialogAcuerdo
        open={dialogo !== null}
        onOpenChange={(v) => !v && setDialogo(null)}
        comiteId={comiteId}
        reunionId={reunionId}
        acuerdo={dialogo?.acuerdo ?? null}
        modo={dialogo?.modo ?? 'completo'}
        responsables={responsables}
        onGuardado={onCambio}
      />
    </>
  )
}

type FiltroAcuerdos = 'abiertos' | 'vencidos' | 'mios' | 'cumplidos' | 'todos'

export function AcuerdosComite() {
  const { comite, recargarComites } = useComite()
  const { puede, userId } = usePermisosSso('comite')
  const { nombreUsuario } = useDatosSso()
  const [acuerdos, setAcuerdos] = useState<AcuerdoV[]>([])
  const [filtro, setFiltro] = useState<FiltroAcuerdos>('abiertos')
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(() => {
    listarAcuerdos({ comiteId: comite.id })
      .then(setAcuerdos)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [comite.id])
  useEffect(cargar, [cargar])

  const visibles = useMemo(() => {
    const f = acuerdos.filter((a) =>
      filtro === 'abiertos' ? abierto(a) : filtro === 'vencidos' ? a.vencido : filtro === 'mios' ? a.responsable_user_id === userId : filtro === 'cumplidos' ? a.estado === 'cumplido' : true,
    )
    // vencidos primero, después por plazo
    return f.sort((a, b) => Number(b.vencido) - Number(a.vencido) || (a.fecha_compromiso ?? '9999').localeCompare(b.fecha_compromiso ?? '9999'))
  }, [acuerdos, filtro, userId])

  const etiquetas: Record<FiltroAcuerdos, string> = { abiertos: 'Abiertos', vencidos: 'Vencidos', mios: 'A mi cargo', cumplidos: 'Cumplidos', todos: 'Todos' }
  const cuenta: Record<FiltroAcuerdos, number> = {
    abiertos: acuerdos.filter(abierto).length,
    vencidos: acuerdos.filter((a) => a.vencido).length,
    mios: acuerdos.filter((a) => a.responsable_user_id === userId).length,
    cumplidos: acuerdos.filter((a) => a.estado === 'cumplido').length,
    todos: acuerdos.length,
  }

  if (loading) return <div className="h-24 animate-pulse rounded bg-muted" />
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(etiquetas) as FiltroAcuerdos[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFiltro(k)}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium', filtro === k ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted')}
            >
              {etiquetas[k]} <span className="ml-1 opacity-70">{cuenta[k]}</span>
            </button>
          ))}
        </div>
        {puede('exportar') && (
          <Button size="sm" variant="outline" disabled={visibles.length === 0} onClick={() => exportarAcuerdos(comite, visibles, nombreUsuario)}>
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
          </Button>
        )}
      </div>
      <Card>
        <CardContent className="pt-2">
          <TablaAcuerdos
            acuerdos={visibles}
            comiteId={comite.id}
            reunionId={null}
            mostrarReunion
            onCambio={() => {
              cargar()
              recargarComites()
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- Integrantes

const CARGO: Record<CargoComite, string> = { presidente: 'Presidente', secretario: 'Secretario' }

export function IntegrantesComite() {
  const { comite, recargarComites } = useComite()
  const { puede } = usePermisosSso('comite')
  const [miembros, setMiembros] = useState<MiembroV[]>([])
  const [historicos, setHistoricos] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dialogo, setDialogo] = useState<{ miembro: MiembroV | null } | null>(null)

  const cargar = useCallback(() => {
    listarMiembros(comite.id)
      .then(setMiembros)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [comite.id])
  useEffect(cargar, [cargar])

  const cambio = () => {
    cargar()
    recargarComites()
  }

  async function terminar(m: MiembroV) {
    if (!window.confirm(`¿${m.nombre} deja el comité hoy? Se conserva en el historial.`)) return
    try {
      await guardarMiembro(comite.id, m.id, { ...ficha(m), hasta: hoyChile() < m.desde ? m.desde : hoyChile(), cargo: null })
      toast.success('Integrante dado de baja')
      cambio()
    } catch (err) {
      toast.error(errorMiembro(err))
    }
  }

  async function borrar(m: MiembroV) {
    if (!window.confirm(`¿Eliminar a ${m.nombre} del comité? Se pierde su asistencia a reuniones. Para un cambio normal usa "Termina".`)) return
    try {
      await eliminarMiembro(m.id)
      toast.success('Integrante eliminado')
      cambio()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  if (loading) return <div className="h-24 animate-pulse rounded bg-muted" />
  const lista = miembros.filter((m) => historicos || m.vigente)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={historicos} onCheckedChange={(v) => setHistoricos(!!v)} /> Incluir ex integrantes
        </label>
        {puede('editar') && (
          <Button size="sm" variant="outline" onClick={() => setDialogo({ miembro: null })}>
            <Plus className="mr-1 h-4 w-4" /> Agregar integrante
          </Button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {(['empresa', 'trabajadores'] as Representa[]).map((rep) => {
          const grupo = lista.filter((m) => m.representa === rep)
          return (
            <Card key={rep}>
              <CardContent className="pt-4">
                <p className="mb-2 text-sm font-bold">{rep === 'empresa' ? 'Representantes de la empresa' : 'Representantes de los trabajadores'}</p>
                {grupo.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">Sin integrantes.</p>
                ) : (
                  <ul className="divide-y">
                    {grupo.map((m) => (
                      <li key={m.id} className={cn('flex flex-wrap items-center gap-2 py-2 text-sm', !m.vigente && 'opacity-60')}>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">
                            {m.nombre}
                            {m.cargo && <span className="ml-2 rounded-full bg-primary/10 px-2 text-[11px] font-semibold text-primary">{CARGO[m.cargo]}</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {m.calidad === 'titular' ? 'Titular' : 'Suplente'} · {m.cargo_laboral || 'sin cargo'} · desde {fmtFecha(m.desde)}
                            {m.hasta && ` hasta ${fmtFecha(m.hasta)}`}
                            {rep === 'trabajadores' && (m.curso_orientacion ? ` · curso ${fmtFecha(m.curso_orientacion)}` : ' · sin curso de orientación')}
                          </p>
                        </div>
                        {puede('editar') && (
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" title="Editar" onClick={() => setDialogo({ miembro: m })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {m.vigente && !m.hasta && (
                              <Button size="icon" variant="ghost" title="Termina hoy" onClick={() => terminar(m)}>
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            )}
                            {puede('eliminar') && (
                              <Button size="icon" variant="ghost" title="Eliminar" onClick={() => borrar(m)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        DS 54: 3 titulares y 3 suplentes por la empresa y por los trabajadores. Los representantes de los trabajadores se eligen por votación y
        el comité elige presidente y secretario entre sus integrantes.
      </p>
      <DialogMiembro
        open={dialogo !== null}
        onOpenChange={(v) => !v && setDialogo(null)}
        comiteId={comite.id}
        miembro={dialogo?.miembro ?? null}
        excluir={miembros.filter((m) => m.vigente && !m.hasta).map((m) => m.trabajador_id)}
        onGuardado={cambio}
      />
    </div>
  )
}

function ficha(m: MiembroV) {
  return {
    trabajador_id: m.trabajador_id,
    representa: m.representa,
    calidad: m.calidad,
    cargo: m.cargo,
    desde: m.desde,
    hasta: m.hasta,
    curso_orientacion: m.curso_orientacion,
    observaciones: m.observaciones,
  }
}

function DialogMiembro({
  open,
  onOpenChange,
  comiteId,
  miembro,
  excluir,
  onGuardado,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  comiteId: string
  miembro: MiembroV | null
  excluir: string[]
  onGuardado: () => void
}) {
  const [trabajadores, setTrabajadores] = useState<TrabajadorV[]>([])
  const [busca, setBusca] = useState('')
  const [trabajadorId, setTrabajadorId] = useState('')
  const [representa, setRepresenta] = useState<Representa>('trabajadores')
  const [calidad, setCalidad] = useState<Calidad>('titular')
  const [cargo, setCargo] = useState<CargoComite | ''>('')
  const [desde, setDesde] = useState(hoyChile())
  const [hasta, setHasta] = useState('')
  const [curso, setCurso] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!open) return
    if (trabajadores.length === 0) listarTrabajadores().then(setTrabajadores).catch(() => setTrabajadores([]))
    setBusca('')
    setTrabajadorId(miembro?.trabajador_id ?? '')
    setRepresenta(miembro?.representa ?? 'trabajadores')
    setCalidad(miembro?.calidad ?? 'titular')
    setCargo(miembro?.cargo ?? '')
    setDesde(miembro?.desde ?? hoyChile())
    setHasta(miembro?.hasta ?? '')
    setCurso(miembro?.curso_orientacion ?? '')
  }, [open, miembro]) // eslint-disable-line react-hooks/exhaustive-deps

  const opciones = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return trabajadores
      .filter((t) => t.activo && t.empresa_propia && (!excluir.includes(t.id) || t.id === miembro?.trabajador_id))
      .filter((t) => !q || `${t.nombres} ${t.apellidos} ${t.rut}`.toLowerCase().includes(q))
      .sort((a, b) => `${a.apellidos} ${a.nombres}`.localeCompare(`${b.apellidos} ${b.nombres}`))
  }, [trabajadores, busca, excluir, miembro])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!trabajadorId) {
      toast.error('Elige al trabajador')
      return
    }
    setEnviando(true)
    try {
      await guardarMiembro(comiteId, miembro?.id ?? null, {
        trabajador_id: trabajadorId,
        representa,
        calidad,
        cargo: cargo || null,
        desde,
        hasta: hasta || null,
        curso_orientacion: curso || null,
        observaciones: miembro?.observaciones ?? null,
      })
      toast.success(miembro ? 'Integrante actualizado' : 'Integrante agregado')
      onGuardado()
      onOpenChange(false)
    } catch (err) {
      toast.error(errorMiembro(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{miembro ? `Editar: ${miembro.nombre}` : 'Agregar integrante'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {!miembro && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mi-busca">Trabajador (de Tecnopanel) *</Label>
              <Input id="mi-busca" placeholder="Buscar por nombre o RUT" value={busca} onChange={(e) => setBusca(e.target.value)} />
              <select value={trabajadorId} onChange={(e) => setTrabajadorId(e.target.value)} className={selectClase} size={6} aria-label="Trabajador">
                {opciones.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.apellidos}, {t.nombres} · {t.rut}
                    {t.cargo ? ` · ${t.cargo}` : ''}
                  </option>
                ))}
              </select>
              {trabajadores.length > 0 && opciones.length === 0 && <p className="text-[11px] text-muted-foreground">Nadie coincide. Los trabajadores se registran en el módulo Trabajadores.</p>}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mi-rep">Representa a</Label>
              <select id="mi-rep" value={representa} onChange={(e) => setRepresenta(e.target.value as Representa)} className={selectClase}>
                <option value="empresa">La empresa</option>
                <option value="trabajadores">Los trabajadores</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mi-cal">Calidad</Label>
              <select id="mi-cal" value={calidad} onChange={(e) => setCalidad(e.target.value as Calidad)} className={selectClase}>
                <option value="titular">Titular</option>
                <option value="suplente">Suplente</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mi-cargo">Cargo en el comité</Label>
              <select id="mi-cargo" value={cargo} onChange={(e) => setCargo(e.target.value as CargoComite | '')} className={selectClase}>
                <option value="">—</option>
                <option value="presidente">Presidente</option>
                <option value="secretario">Secretario</option>
              </select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mi-desde">Desde</Label>
              <Input id="mi-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mi-hasta">Hasta</Label>
              <Input id="mi-hasta" type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mi-curso">Curso de orientación</Label>
              <Input id="mi-curso" type="date" value={curso} max={hoyChile()} onChange={(e) => setCurso(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
