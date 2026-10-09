import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { CON_LESION, MUTUAL, TIPOS_EVENTO, guardarEvento, obtenerEvento, subirArchivo, type EventoV, type FichaEvento, type Gravedad, type TipoEvento } from '../lib/apiAccidentes'
import { listarTrabajadores } from '../lib/apiTrabajadores'
import { RUTA } from '../lib/rutas'
import type { TrabajadorV } from '../lib/tiposTrabajadores'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'
import { useCatalogosTrabajadores } from '../hooks/useCatalogosTrabajadores'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

/** 'AAAA-MM-DDTHH:mm' en hora de Chile, para el input datetime-local. */
function ahoraLocal(d = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour') === '24' ? '00' : v('hour')}:${v('minute')}`
}

/** El input entrega hora de Chile sin zona; se convierte a instante con el desfase de Chile en esa fecha. */
function aInstante(local: string): string {
  const supuesto = new Date(`${local}:00Z`)
  const enChile = new Date(supuesto.toLocaleString('en-US', { timeZone: 'America/Santiago' }))
  const enUtc = new Date(supuesto.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(supuesto.getTime() + (enUtc.getTime() - enChile.getTime())).toISOString()
}

/** Reportar (/accidentes/nuevo) o completar (/accidentes/:id/editar) un evento. */
export default function FormEvento() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede, userId, loading: permisosLoading } = usePermisosSso('accidentes')
  const { areas } = useDatosSso()
  const { empresas } = useCatalogosTrabajadores()
  const [trabajadores, setTrabajadores] = useState<TrabajadorV[]>([])
  const [original, setOriginal] = useState<EventoV | null>(null)
  const [f, setF] = useState<FichaEvento>({ tipo: 'accidente_ctp', gravedad: 'leve', dias_perdidos: 0 })
  const [cuando, setCuando] = useState(ahoraLocal())
  const [buscar, setBuscar] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    Promise.all([listarTrabajadores(), id ? obtenerEvento(id) : null])
      .then(([t, ev]) => {
        setTrabajadores(t)
        if (ev) {
          setOriginal(ev)
          const { id: _i, numero: _n, created_at: _c, updated_at: _u, cerrado_por: _cp, cerrado_en: _ce, fecha: _f, empresa: _e, empresa_propia: _ep, con_tiempo_perdido: _ct, medidas: _m, medidas_pendientes: _mp, ...resto } = ev
          void [_i, _n, _c, _u, _cp, _ce, _f, _e, _ep, _ct, _m, _mp]
          setF(resto)
          setCuando(ahoraLocal(new Date(ev.ocurrido_en)))
        }
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setCargando(false))
  }, [id])

  const candidatos = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    const qRut = buscar.replace(/[^0-9kK]/g, '')
    if (!q) return []
    return trabajadores
      .filter((t) => `${t.nombres} ${t.apellidos}`.toLowerCase().includes(q) || (qRut.length >= 3 && t.rut.replace('-', '').includes(qRut)))
      .slice(0, 8)
  }, [trabajadores, buscar])

  const investiga = puede('editar') || puede('aprobar')
  const puedeGuardar = id ? investiga || (original?.reportado_por === userId && original?.estado === 'reportado' && puede('crear')) : puede('crear')
  if (!permisosLoading && !cargando && !puedeGuardar) return <Navigate to={id ? RUTA.evento(id) : RUTA.accidentes} replace />

  const set = <K extends keyof FichaEvento>(k: K, v: FichaEvento[K]) => setF((x) => ({ ...x, [k]: v }))
  const tipo = (f.tipo ?? 'accidente_ctp') as TipoEvento
  const conLesion = CON_LESION.includes(tipo)
  const afectado = trabajadores.find((t) => t.id === f.trabajador_id)
  const grave = f.gravedad === 'grave' || f.gravedad === 'fatal'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!f.descripcion?.trim()) {
      toast.error('Describe lo ocurrido')
      return
    }
    if (conLesion && !f.trabajador_id) {
      toast.error('Indica el trabajador afectado')
      return
    }
    setEnviando(true)
    try {
      const ficha: FichaEvento = {
        ...f,
        ocurrido_en: aInstante(cuando),
        descripcion: f.descripcion.trim(),
        trabajador_id: conLesion || f.trabajador_id ? f.trabajador_id ?? null : null,
        dias_perdidos: conLesion ? Number(f.dias_perdidos ?? 0) : 0,
      }
      if (!id) delete ficha.estado
      const evId = await guardarEvento(id ?? null, ficha)
      for (const a of archivos) {
        try {
          await subirArchivo(evId, a)
        } catch (err) {
          toast.warning(`${a.name}: ${err instanceof Error ? err.message : 'no se pudo subir'}`)
        }
      }
      toast.success(id ? 'Evento actualizado' : 'Evento reportado')
      navigate(RUTA.evento(evId), { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
      setEnviando(false)
    }
  }

  if (cargando) return <div className="h-40 animate-pulse rounded bg-muted" />

  return (
    <div className="space-y-4">
      <Link to={id ? RUTA.evento(id) : RUTA.accidentes} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {id ? 'Volver al evento' : 'Volver a accidentes e incidentes'}
      </Link>
      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <h1 className="text-lg font-extrabold">{id ? `Evento N° ${original?.numero}` : 'Reportar accidente o incidente'}</h1>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ev-tipo">Tipo *</Label>
                <select id="ev-tipo" value={tipo} onChange={(e) => set('tipo', e.target.value as TipoEvento)} className={selectClase}>
                  {TIPOS_EVENTO.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ev-cuando">Fecha y hora *</Label>
                <Input id="ev-cuando" type="datetime-local" value={cuando} max={ahoraLocal()} onChange={(e) => setCuando(e.target.value)} required />
              </div>
              {conLesion && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ev-grav">Gravedad *</Label>
                  <select id="ev-grav" value={f.gravedad ?? 'leve'} onChange={(e) => set('gravedad', e.target.value as Gravedad)} className={selectClase}>
                    <option value="leve">Leve</option>
                    <option value="grave">Grave</option>
                    <option value="fatal">Fatal</option>
                  </select>
                </div>
              )}
            </div>

            {conLesion && grave && (
              <div className="flex gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-bold">Accidente {f.gravedad}: obligaciones inmediatas</p>
                  <ul className="mt-1 list-disc pl-4 text-xs">
                    <li>Suspender de inmediato las faenas afectadas y, si es necesario, evacuar.</li>
                    <li>Notificar de inmediato a la Inspección del Trabajo y a la Seremi de Salud.</li>
                    <li>Avisar a la {MUTUAL} e ingresar la DIAT.</li>
                    <li>Al guardar, Prevención recibe un aviso en el portal.</li>
                  </ul>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ev-area">Área</Label>
                <select id="ev-area" value={f.area_id ?? ''} onChange={(e) => set('area_id', e.target.value || null)} className={selectClase}>
                  <option value="">Sin área</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ev-lugar">Lugar exacto</Label>
                <Input id="ev-lugar" value={f.lugar ?? ''} onChange={(e) => set('lugar', e.target.value || null)} placeholder={tipo === 'trayecto' ? 'Ej: Av. Matta con San Diego' : 'Ej: nave 2, puesto 4'} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{conLesion ? 'Trabajador afectado *' : 'Trabajador involucrado (opcional)'}</Label>
              {afectado ? (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <span className="flex-1">
                    <span className="font-semibold">
                      {afectado.apellidos}, {afectado.nombres}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {afectado.cargo ?? 'sin cargo'} · {afectado.empresa}
                    </span>
                  </span>
                  <button type="button" onClick={() => set('trabajador_id', null)} className="text-muted-foreground hover:text-foreground" aria-label="Quitar">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar por nombre o RUT" value={buscar} onChange={(e) => setBuscar(e.target.value)} className="pl-8" />
                  {candidatos.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full divide-y rounded-md border bg-popover shadow-lg">
                      {candidatos.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                            onClick={() => {
                              set('trabajador_id', t.id)
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
              {!afectado && !conLesion && (
                <div className="flex flex-col gap-1.5 pt-1">
                  <Label htmlFor="ev-emp" className="text-xs text-muted-foreground">Empresa (si no hay trabajador)</Label>
                  <select id="ev-emp" value={f.empresa_id ?? ''} onChange={(e) => set('empresa_id', e.target.value || null)} className={selectClase}>
                    <option value="">Tecnopanel</option>
                    {empresas.filter((e) => !e.propia).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-desc">Qué ocurrió *</Label>
              <Textarea id="ev-desc" rows={4} value={f.descripcion ?? ''} onChange={(e) => set('descripcion', e.target.value)} placeholder="Qué se estaba haciendo, qué pasó y consecuencias" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-test">Testigos</Label>
              <Input id="ev-test" value={f.testigos ?? ''} onChange={(e) => set('testigos', e.target.value || null)} placeholder="Nombres de quienes presenciaron" />
            </div>
          </CardContent>
        </Card>

        {conLesion && (
          <Card>
            <CardContent className="space-y-3 pt-5">
              <p className="text-sm font-bold">Lesión y atención ({MUTUAL})</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ev-les">Tipo de lesión</Label>
                  <Input id="ev-les" value={f.lesion ?? ''} onChange={(e) => set('lesion', e.target.value || null)} placeholder="Ej: contusión, corte, fractura" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ev-parte">Parte del cuerpo</Label>
                  <Input id="ev-parte" value={f.parte_cuerpo ?? ''} onChange={(e) => set('parte_cuerpo', e.target.value || null)} placeholder="Ej: mano derecha" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ev-folio">Folio DIAT / DIEP</Label>
                  <Input id="ev-folio" value={f.diat_folio ?? ''} onChange={(e) => set('diat_folio', e.target.value || null)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ev-fdiat">Fecha DIAT</Label>
                  <Input id="ev-fdiat" type="date" value={f.diat_fecha ?? ''} onChange={(e) => set('diat_fecha', e.target.value || null)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ev-dias">Días perdidos</Label>
                  <Input id="ev-dias" type="number" min={0} value={f.dias_perdidos ?? 0} onChange={(e) => set('dias_perdidos', Math.max(0, Number(e.target.value) || 0))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ev-alta">Fecha de alta</Label>
                  <Input id="ev-alta" type="date" value={f.fecha_alta ?? ''} onChange={(e) => set('fecha_alta', e.target.value || null)} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="space-y-2 pt-5">
            <Label htmlFor="ev-arch">Fotos y documentos (lugar, DIAT, informe médico…)</Label>
            <Input id="ev-arch" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setArchivos(Array.from(e.target.files ?? []))} />
            {id && <p className="text-xs text-muted-foreground">Los archivos ya adjuntos se ven en la ficha del evento; aquí se agregan nuevos.</p>}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : id ? 'Guardar cambios' : 'Reportar'}
          </Button>
        </div>
      </form>
    </div>
  )
}
