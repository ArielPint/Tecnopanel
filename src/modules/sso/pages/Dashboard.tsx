import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { IndicadoresFecha } from '@/components/IndicadoresFecha'
import { cn } from '@/lib/utils'
import { listarHallazgos } from '../lib/api'
import { calcularIndicadores } from '../lib/indicadores'
import { fmtFecha, hoyChile } from '../lib/estados'
import { RUTA } from '../lib/rutas'
import type { Hallazgo } from '../lib/tipos'
import { listarTrabajadores } from '../lib/apiTrabajadores'
import { listarCapacitaciones, listarVigencias, type CapacitacionV, type VigenciaCapacitacion } from '../lib/apiCapacitaciones'
import { listarEntregas, listarEppVigentes, type EntregaV, type EppVigente } from '../lib/apiEpp'
import { cumplimiento, listarInspecciones, listarPrograma, type InspeccionV, type Programa } from '../lib/apiInspecciones'
import { calcularTasas, diasSinAccidentes, listarDotacion, listarEventos, mesesEntre, type Dotacion, type EventoV } from '../lib/apiAccidentes'
import { listarEmpresas } from '../lib/apiTrabajadores'
import { listarDocumentos, type DocumentoV } from '../lib/apiDocumentos'
import { listarAcuerdos, listarComites, type AcuerdoV, type ComiteV } from '../lib/apiComite'
import type { TrabajadorV } from '../lib/tiposTrabajadores'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'
import { EstadoBadge, VencidoBadge } from '../components/EstadoBadge'

// Dashboard del portal: lo ve cualquiera con acceso. Cada fase (Accidentes, Capacitaciones, EPP,
// Inspecciones, Documentos...) agrega su sección.

function Tile({ titulo, valor, detalle, alerta, to }: { titulo: string; valor: string; detalle?: string; alerta?: boolean; to?: string }) {
  const contenido = (
    <CardContent className="pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className={cn('mt-1 font-mono-tabular text-2xl font-extrabold', alerta && 'text-red-700 dark:text-red-400')}>{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>}
    </CardContent>
  )
  return <Card className={cn(to && 'transition-colors hover:bg-accent/50')}>{to ? <Link to={to}>{contenido}</Link> : contenido}</Card>
}

function ListaAtencion({ titulo, vacio, items, nombreArea }: { titulo: string; vacio: string; items: Hallazgo[]; nombreArea: (id: string | null) => string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="mb-2 text-sm font-bold">{titulo}</p>
        {items.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{vacio}</p>
        ) : (
          <ul className="divide-y">
            {items.slice(0, 6).map((h) => (
              <li key={h.id}>
                <Link to={RUTA.hallazgo(h.id)} className="flex items-center gap-3 py-2 hover:bg-accent/40">
                  <span className="w-10 shrink-0 font-mono-tabular text-sm font-semibold">N° {h.numero}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{h.descripcion}</span>
                    <span className="block text-xs text-muted-foreground">
                      {nombreArea(h.area_id)} · plazo {fmtFecha(h.fecha_compromiso)}
                    </span>
                  </span>
                  {h.vencido ? <VencidoBadge dias={h.dias_atraso} /> : <EstadoBadge estado={h.estado} />}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {items.length > 6 && <p className="pt-2 text-xs text-muted-foreground">y {items.length - 6} más</p>}
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const { puedeEn, userId, loading: permisosLoading } = usePermisosSso()
  const { areas, nombreArea } = useDatosSso()
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([])
  const [trabajadores, setTrabajadores] = useState<TrabajadorV[]>([])
  const [loading, setLoading] = useState(true)
  const veHallazgos = puedeEn('hallazgos', 'ver')
  const veTrabajadores = puedeEn('trabajadores', 'ver')
  const veSalud = puedeEn('trabajadores', 'aprobar')

  useEffect(() => {
    if (permisosLoading) return
    Promise.all([
      veHallazgos ? listarHallazgos().then(setHallazgos) : null,
      veTrabajadores ? listarTrabajadores().then(setTrabajadores) : null,
    ]).finally(() => setLoading(false))
  }, [permisosLoading, veHallazgos, veTrabajadores])

  const ind = useMemo(() => calcularIndicadores(hallazgos, areas, '12m', ''), [hallazgos, areas])
  // Lo que le toca a cada uno: primero lo vencido, después por plazo
  const porPlazo = (a: Hallazgo, b: Hallazgo) => Number(b.vencido) - Number(a.vencido) || a.fecha_compromiso.localeCompare(b.fecha_compromiso)
  const misPendientes = hallazgos
    .filter((h) => h.responsable_user_id === userId && (h.estado === 'abierto' || h.estado === 'en_proceso'))
    .sort(porPlazo)
  const porVerificar = hallazgos.filter((h) => h.estado === 'pend_verificacion').sort(porPlazo)

  if (loading || permisosLoading) return <div className="h-40 animate-pulse rounded bg-muted" />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Seguridad y Salud Ocupacional · toda la empresa</p>
        </div>
        <IndicadoresFecha />
      </div>

      <PanelAtencion />

      {!veHallazgos && !veTrabajadores && (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Usa el menú para entrar a los módulos de Prevención a los que tienes acceso.
        </p>
      )}

      {veHallazgos && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Hallazgos</h2>
            <Link to={RUTA.indicadoresHallazgos} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              Ver indicadores <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile titulo="Pendientes" valor={String(ind.pendientes)} detalle={`${ind.porEstado.abierto} abiertos · ${ind.porEstado.en_proceso} en proceso`} to={RUTA.hallazgos} />
            <Tile titulo="Vencidos" valor={String(ind.vencidos)} alerta={ind.vencidos > 0} detalle="Con el plazo cumplido" to={RUTA.hallazgos} />
            <Tile titulo="Por verificar" valor={String(ind.porEstado.pend_verificacion)} detalle="Esperan validación de Prevención" to={RUTA.hallazgos} />
            <Tile
              titulo="Cumplimiento de plazo"
              valor={ind.pctEnPlazo === null ? '—' : `${ind.pctEnPlazo}%`}
              detalle="Cerrados en los últimos 12 meses"
              to={RUTA.indicadoresHallazgos}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ListaAtencion titulo="A tu cargo" vacio="No tienes hallazgos pendientes." items={misPendientes} nombreArea={nombreArea} />
            {puedeEn('hallazgos', 'aprobar') && (
              <ListaAtencion titulo="Por verificar" vacio="No hay cierres esperando validación." items={porVerificar} nombreArea={nombreArea} />
            )}
          </div>
        </section>
      )}

      {puedeEn('accidentes', 'ver') && <SeccionAccidentes />}

      {puedeEn('inspecciones', 'ver') && <SeccionInspecciones />}

      {puedeEn('capacitaciones', 'ver') && <SeccionCapacitaciones />}

      {puedeEn('epp', 'ver') && <SeccionEpp />}

      {puedeEn('comite', 'ver') && <SeccionComite userId={userId} />}

      {puedeEn('documentos', 'ver') && <SeccionDocumentos />}

      {veTrabajadores && <SeccionTrabajadores trabajadores={trabajadores} conSalud={veSalud} />}
    </div>
  )
}

interface Pendiente {
  modulo: string
  clave: string
  etiqueta: string
  cantidad: number
  nivel: 'critico' | 'alerta'
  ruta: string
}

/** Lo que requiere atención en todos los módulos que ve la persona (sso_pendientes, con su RLS). */
function PanelAtencion() {
  const [items, setItems] = useState<Pendiente[] | null>(null)

  useEffect(() => {
    supabase
      .rpc('sso_pendientes')
      .then(({ data, error }) => setItems(error ? [] : ((data as Pendiente[]) ?? []).sort((a, b) => Number(b.nivel === 'critico') - Number(a.nivel === 'critico'))))
  }, [])

  if (items === null) return null
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="mb-2 text-sm font-bold">Requiere atención</p>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Todo al día en los módulos a los que tienes acceso.
          </p>
        ) : (
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {items.map((p) => (
              <li key={p.clave}>
                <Link to={p.ruta} className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-accent/50">
                  {p.nivel === 'critico' ? (
                    <AlertOctagon className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-label="Crítico" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-label="Alerta" />
                  )}
                  <span className="min-w-0 flex-1">{p.etiqueta}</span>
                  <span className="font-mono-tabular font-bold">{p.cantidad}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function SeccionAccidentes() {
  const [eventos, setEventos] = useState<EventoV[]>([])
  const [dotacion, setDotacion] = useState<Dotacion[]>([])
  const [propia, setPropia] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    Promise.all([listarEventos(), listarDotacion(), listarEmpresas()])
      .then(([e, d, em]) => {
        setEventos(e)
        setDotacion(d)
        setPropia(em.find((x) => x.propia)?.id ?? null)
      })
      .finally(() => setListo(true))
  }, [])

  if (!listo || !propia) return null
  const hoy = hoyChile()
  const anio = calcularTasas(eventos, dotacion, propia, mesesEntre(`${hoy.slice(0, 4)}-01-01`, hoy))
  const sin = diasSinAccidentes(eventos, propia, hoy)
  const abiertos = eventos.filter((e) => e.estado !== 'cerrado')
  const gravesSinNotificar = eventos.filter((e) => (e.gravedad === 'grave' || e.gravedad === 'fatal') && !e.autoridad_notificada_en).length

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Accidentes e incidentes · Tecnopanel</h2>
        <Link to={RUTA.indicadoresAccidentes} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          Ver tasas <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {gravesSinNotificar > 0 && (
        <Link to={RUTA.accidentes} className="block rounded-md border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100">
          {gravesSinNotificar} accidente{gravesSinNotificar > 1 ? 's' : ''} grave{gravesSinNotificar > 1 ? 's' : ''} sin notificación registrada a la autoridad
        </Link>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile titulo="Días sin accidentes" valor={sin === null ? '—' : String(sin)} detalle="Con tiempo perdido" to={RUTA.indicadoresAccidentes} />
        <Tile
          titulo="Accidentabilidad del año"
          valor={anio.accidentabilidad === null ? '—' : anio.accidentabilidad.toLocaleString('es-CL')}
          detalle={`${anio.accidentes} accidentes · ${anio.diasPerdidos} días perdidos`}
          to={RUTA.indicadoresAccidentes}
        />
        <Tile
          titulo="Siniestralidad del año"
          valor={anio.siniestralidad === null ? '—' : anio.siniestralidad.toLocaleString('es-CL')}
          detalle={anio.mesesSinDotacion.length ? `Faltan ${anio.mesesSinDotacion.length} meses de dotación` : 'Días perdidos ÷ dotación × 100'}
          to={RUTA.indicadoresAccidentes}
        />
        <Tile titulo="Investigaciones abiertas" valor={String(abiertos.length)} alerta={abiertos.length > 0} detalle="Toda la empresa y contratistas" to={RUTA.accidentes} />
      </div>
    </section>
  )
}

function SeccionInspecciones() {
  const [programa, setPrograma] = useState<Programa[]>([])
  const [inspecciones, setInspecciones] = useState<InspeccionV[]>([])
  const [listo, setListo] = useState(false)

  useEffect(() => {
    Promise.all([listarPrograma(), listarInspecciones()])
      .then(([p, i]) => {
        setPrograma(p)
        setInspecciones(i)
      })
      .finally(() => setListo(true))
  }, [])

  const h = hoyChile()
  const hace30 = new Date(Date.UTC(+h.slice(0, 4), +h.slice(5, 7) - 1, +h.slice(8, 10) - 30)).toISOString().slice(0, 10)
  const recientes = inspecciones.filter((i) => i.fecha >= hace30)
  const pct = cumplimiento(recientes.reduce((s, i) => ({ cumple: s.cumple + i.cumple, no_cumple: s.no_cumple + i.no_cumple }), { cumple: 0, no_cumple: 0 }))
  const atrasadas = programa.filter((p) => p.situacion === 'atrasada' || p.situacion === 'nunca').length

  if (!listo) return null
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Inspecciones</h2>
        <Link to={RUTA.inspecciones} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          Ver programa <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile titulo="Atrasadas o pendientes" valor={String(atrasadas)} alerta={atrasadas > 0} detalle={`de ${programa.length} programadas`} to={RUTA.inspecciones} />
        <Tile titulo="Tocan esta semana" valor={String(programa.filter((p) => p.situacion === 'proxima').length)} detalle="Según su periodicidad" to={RUTA.inspecciones} />
        <Tile titulo="Realizadas (30 días)" valor={String(recientes.length)} detalle={`${recientes.reduce((s, i) => s + Number(i.hallazgos), 0)} hallazgos generados`} to={RUTA.inspeccionesRealizadas} />
        <Tile titulo="Cumplimiento (30 días)" valor={pct === null ? '—' : `${pct}%`} detalle="Ítems que cumplen" to={RUTA.inspeccionesRealizadas} />
      </div>
    </section>
  )
}

function SeccionCapacitaciones() {
  const [caps, setCaps] = useState<CapacitacionV[]>([])
  const [vigencias, setVigencias] = useState<VigenciaCapacitacion[]>([])
  const [listo, setListo] = useState(false)

  useEffect(() => {
    Promise.all([listarCapacitaciones(), listarVigencias()])
      .then(([c, v]) => {
        setCaps(c)
        setVigencias(v)
      })
      .finally(() => setListo(true))
  }, [])

  const mes = hoyChile().slice(0, 7)
  const delMes = caps.filter((c) => c.fecha.startsWith(mes))
  const hh = delMes.reduce((s, c) => s + Number(c.horas_hombre), 0)
  const vencidas = vigencias.filter((v) => v.situacion === 'vencido').length
  const porVencer = vigencias.filter((v) => v.situacion === 'por_vencer').length

  if (!listo) return null
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Capacitaciones</h2>
        <Link to={RUTA.vigenciasCapacitaciones} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          Ver vigencias <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile titulo="Este mes" valor={String(delMes.length)} detalle={`${delMes.filter((c) => c.tipo.toLowerCase().includes('charla')).length} charlas de 5 minutos`} to={RUTA.capacitaciones} />
        <Tile titulo="Horas-hombre del mes" valor={hh.toLocaleString('es-CL', { maximumFractionDigits: 1 })} detalle="Duración × asistentes" to={RUTA.capacitaciones} />
        <Tile titulo="Cursos vencidos" valor={String(vencidas)} alerta={vencidas > 0} detalle="Trabajador × curso con vigencia" to={RUTA.vigenciasCapacitaciones} />
        <Tile titulo="Por vencer" valor={String(porVencer)} detalle="En los próximos 30 días" to={RUTA.vigenciasCapacitaciones} />
      </div>
    </section>
  )
}

function SeccionEpp() {
  const [entregas, setEntregas] = useState<EntregaV[]>([])
  const [vigentes, setVigentes] = useState<EppVigente[]>([])
  const [listo, setListo] = useState(false)

  useEffect(() => {
    Promise.all([listarEntregas(), listarEppVigentes()])
      .then(([e, v]) => {
        setEntregas(e)
        setVigentes(v)
      })
      .finally(() => setListo(true))
  }, [])

  const mes = hoyChile().slice(0, 7)
  const delMes = entregas.filter((e) => e.fecha.startsWith(mes))
  const vencidos = vigentes.filter((v) => v.situacion === 'vencido')
  const porVencer = vigentes.filter((v) => v.situacion === 'por_vencer')
  const personas = new Set([...vencidos, ...porVencer].map((v) => v.trabajador_id)).size

  if (!listo) return null
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Entrega de EPP</h2>
        <Link to={RUTA.reposicionesEpp} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          Ver reposiciones <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile titulo="Entregas del mes" valor={String(delMes.length)} detalle={`${delMes.reduce((s, e) => s + Number(e.unidades), 0)} unidades`} to={RUTA.epp} />
        <Tile titulo="Reposiciones vencidas" valor={String(vencidos.length)} alerta={vencidos.length > 0} detalle="Elementos con la vida útil cumplida" to={RUTA.reposicionesEpp} />
        <Tile titulo="Por vencer" valor={String(porVencer.length)} detalle="En los próximos 15 días" to={RUTA.reposicionesEpp} />
        <Tile titulo="Trabajadores a reponer" valor={String(personas)} detalle="Con algo vencido o por vencer" to={RUTA.reposicionesEpp} />
      </div>
    </section>
  )
}

function SeccionComite({ userId }: { userId: string | null }) {
  const [comites, setComites] = useState<ComiteV[]>([])
  const [acuerdos, setAcuerdos] = useState<AcuerdoV[]>([])
  const [listo, setListo] = useState(false)

  useEffect(() => {
    Promise.all([listarComites(), listarAcuerdos({})])
      .then(([c, a]) => {
        setComites(c.filter((x) => x.activo))
        setAcuerdos(a)
      })
      .finally(() => setListo(true))
  }, [])

  if (!listo || comites.length === 0) return null
  const h = hoyChile()
  const hace31 = new Date(Date.UTC(+h.slice(0, 4), +h.slice(5, 7) - 1, +h.slice(8, 10) - 31)).toISOString().slice(0, 10)
  const sinReunion = comites.filter((c) => !c.ultima_ordinaria || c.ultima_ordinaria < hace31)
  const abiertos = acuerdos.filter((a) => a.estado === 'pendiente' || a.estado === 'en_proceso')
  const vencidos = abiertos.filter((a) => a.vencido).length
  const mios = abiertos.filter((a) => a.responsable_user_id === userId).length
  const proxima = comites.map((c) => c.proxima_reunion).filter((f): f is string => !!f).sort()[0]

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Comité Paritario</h2>
        <Link to={RUTA.acuerdosComite} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          Ver acuerdos <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          titulo="Reunión ordinaria"
          valor={sinReunion.length ? `${sinReunion.length} sin reunión` : 'Al día'}
          alerta={sinReunion.length > 0}
          detalle={proxima ? `Próxima: ${fmtFecha(proxima)}` : 'Una al mes por comité'}
          to={RUTA.comite}
        />
        <Tile titulo="Acuerdos abiertos" valor={String(abiertos.length)} detalle={`${comites.length} comité${comites.length > 1 ? 's' : ''} activo${comites.length > 1 ? 's' : ''}`} to={RUTA.acuerdosComite} />
        <Tile titulo="Acuerdos vencidos" valor={String(vencidos)} alerta={vencidos > 0} detalle="Con el plazo cumplido" to={RUTA.acuerdosComite} />
        <Tile titulo="A tu cargo" valor={String(mios)} detalle="Acuerdos donde eres responsable" to={RUTA.acuerdosComite} />
      </div>
    </section>
  )
}

function SeccionDocumentos() {
  const [docs, setDocs] = useState<DocumentoV[]>([])
  const [listo, setListo] = useState(false)

  useEffect(() => {
    listarDocumentos()
      .then(setDocs)
      .finally(() => setListo(true))
  }, [])

  if (!listo) return null
  const activos = docs.filter((d) => d.activo)
  const n = (s: DocumentoV['situacion']) => activos.filter((d) => d.situacion === s).length
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Documentos</h2>
        <Link to={RUTA.documentos} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          Ver listado maestro <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile titulo="Documentos vigentes" valor={String(n('vigente'))} detalle={`de ${activos.length} en uso`} to={RUTA.documentos} />
        <Tile titulo="Revisión vencida" valor={String(n('vencido'))} alerta={n('vencido') > 0} detalle="Pasó su fecha de revisión" to={RUTA.documentos} />
        <Tile titulo="Por vencer" valor={String(n('por_vencer'))} detalle="En los próximos 30 días" to={RUTA.documentos} />
        <Tile titulo="Sin archivo" valor={String(n('sin_version'))} detalle="Registrados sin versión subida" to={RUTA.documentos} />
      </div>
    </section>
  )
}

function SeccionTrabajadores({ trabajadores, conSalud }: { trabajadores: TrabajadorV[]; conSalud: boolean }) {
  const activos = trabajadores.filter((t) => t.activo)
  const contratistas = activos.filter((t) => !t.empresa_propia).length
  const empresas = new Set(activos.filter((t) => !t.empresa_propia).map((t) => t.empresa_id)).size
  const conVencidos = activos.filter((t) => t.examenes_vencidos > 0)
  const porVencer = activos.filter((t) => t.examenes_por_vencer > 0 && t.examenes_vencidos === 0)
  const revisar = [...conVencidos, ...porVencer]

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Trabajadores</h2>
        <Link to={RUTA.trabajadores} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          Ver trabajadores <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile titulo="Activos" valor={String(activos.length)} detalle={`${activos.length - contratistas} propios`} to={RUTA.trabajadores} />
        <Tile titulo="De contratistas" valor={String(contratistas)} detalle={`${empresas} ${empresas === 1 ? 'empresa' : 'empresas'}`} to={RUTA.trabajadores} />
        {conSalud && (
          <>
            <Tile titulo="Con exámenes vencidos" valor={String(conVencidos.length)} alerta={conVencidos.length > 0} detalle="Trabajadores activos" to={RUTA.trabajadores} />
            <Tile titulo="Exámenes por vencer" valor={String(porVencer.length)} detalle="En los próximos 30 días" to={RUTA.trabajadores} />
          </>
        )}
      </div>
      {conSalud && revisar.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="mb-2 text-sm font-bold">Exámenes por revisar</p>
            <ul className="divide-y">
              {revisar.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <Link to={RUTA.trabajador(t.id)} className="flex items-center gap-3 py-2 hover:bg-accent/40">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {t.nombres} {t.apellidos}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t.empresa} · {t.cargo ?? 'sin cargo'}
                      </span>
                    </span>
                    {t.examenes_vencidos > 0 ? (
                      <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {t.examenes_vencidos} vencido{t.examenes_vencidos > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        por vencer
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            {revisar.length > 6 && <p className="pt-2 text-xs text-muted-foreground">y {revisar.length - 6} más</p>}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
