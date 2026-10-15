import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { cn } from '@/lib/utils'

// Monitoreo del servidor (solo superadmin). Lo escribe stack\tareas\monitoreo.ps1 cada 5 minutos en
// public.monitor_estado (tabla solo del servidor, RLS: superadmin y root). TI tiene la misma
// información en /monitor/ con usuario y clave aparte.

type Estado = 'ok' | 'aviso' | 'falla'

interface Check {
  grupo: string
  nombre: string
  estado: Estado
  detalle: string
}

interface CambioEstado {
  fecha: string
  nombre: string
  de: Estado
  a: Estado
  detalle: string
}

interface DatosMonitoreo {
  generado: string
  resumen: { estado: Estado; fallas: number; avisos: number; total: number }
  checks: Check[]
  historial: CambioEstado[]
  destinatarios: string[]
}

const REFRESCO_MS = 60_000
const DESACTUALIZADO_MS = 15 * 60_000

const ETIQUETA: Record<Estado, string> = { ok: 'OK', aviso: 'Aviso', falla: 'Falla' }

const CHIP: Record<Estado, string> = {
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  aviso: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  falla: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}

const PUNTO: Record<Estado, string> = { ok: 'bg-emerald-500', aviso: 'bg-amber-500', falla: 'bg-red-500' }

function peorEstado(estados: Estado[]): Estado {
  if (estados.includes('falla')) return 'falla'
  if (estados.includes('aviso')) return 'aviso'
  return 'ok'
}

function Chip({ estado }: { estado: Estado }) {
  return (
    <span className={cn('inline-flex h-fit min-w-[52px] justify-center rounded-full px-2 py-0.5 text-[11px] font-bold', CHIP[estado])}>
      {ETIQUETA[estado]}
    </span>
  )
}

function formatoFecha(iso: string) {
  return new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function MonitoreoPage() {
  const [datos, setDatos] = useState<DatosMonitoreo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [ahora, setAhora] = useState(() => Date.now())

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error } = await supabase.from('monitor_estado').select('datos').eq('id', 1).maybeSingle()
    if (error) setError(error.message)
    else if (!data) setError('Todavía no hay datos del monitoreo (la tarea TP-Monitoreo los escribe cada 5 minutos).')
    else {
      setDatos(data.datos as DatosMonitoreo)
      setError(null)
    }
    setAhora(Date.now())
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar()
    const id = window.setInterval(cargar, REFRESCO_MS)
    return () => window.clearInterval(id)
  }, [cargar])

  const grupos = datos ? Array.from(new Set(datos.checks.map((c) => c.grupo))) : []
  const desactualizado = datos ? ahora - new Date(datos.generado).getTime() > DESACTUALIZADO_MS : false
  const resumen = datos?.resumen

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Monitoreo del servidor</h1>
          <p className="text-sm text-muted-foreground">
            Portal, base de datos, respaldos y tareas de Tecnotruss-INT. Se revisa cada 5 minutos.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {datos && <span>Revisado el <b className="text-foreground">{formatoFecha(datos.generado)}</b></span>}
          <button
            type="button"
            onClick={cargar}
            disabled={cargando}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-semibold text-foreground hover:bg-accent disabled:opacity-60"
          >
            <RefreshCw className={cn('h-4 w-4', cargando && 'animate-spin')} />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          No se pudo leer el monitoreo: {error}
        </div>
      )}

      {desactualizado && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          Estos datos tienen más de 15 minutos: el monitoreo no se está actualizando. Revisa la tarea TP-Monitoreo en el servidor.
        </div>
      )}

      {resumen && (
        <div
          className={cn(
            'flex items-center gap-3 rounded-xl px-5 py-4 text-lg font-semibold',
            resumen.estado === 'ok' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
            resumen.estado === 'aviso' && 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
            resumen.estado === 'falla' && 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
          )}
        >
          {resumen.estado === 'ok' && <CheckCircle2 className="h-6 w-6 shrink-0" />}
          {resumen.estado === 'aviso' && <AlertTriangle className="h-6 w-6 shrink-0" />}
          {resumen.estado === 'falla' && <XCircle className="h-6 w-6 shrink-0" />}
          {resumen.fallas > 0
            ? `${resumen.fallas} ${resumen.fallas === 1 ? 'control con falla' : 'controles con falla'}`
            : resumen.avisos > 0
              ? `Todo funciona (${resumen.avisos} ${resumen.avisos === 1 ? 'aviso' : 'avisos'})`
              : `Todo funciona (${resumen.total} controles OK)`}
        </div>
      )}

      {datos && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {grupos.map((grupo) => {
            const items = datos.checks.filter((c) => c.grupo === grupo)
            return (
              <Card key={grupo} className="gap-3 py-4">
                <CardHeader className="px-4">
                  <CardTitle className="flex items-center gap-2 text-[15px]">
                    <span className={cn('h-2.5 w-2.5 rounded-full', PUNTO[peorEstado(items.map((i) => i.estado))])} />
                    {grupo}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4">
                  <ul className="divide-y divide-border">
                    {items.map((c) => (
                      <li key={c.nombre} className="flex gap-3 py-2">
                        <Chip estado={c.estado} />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">{c.nombre}</div>
                          <div className="whitespace-pre-line break-words text-xs text-muted-foreground">{c.detalle}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {datos && (
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-[15px]">Cambios de estado recientes</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto px-4">
            {datos.historial.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin cambios registrados todavía.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {datos.historial.map((h, i) => (
                    <tr key={`${h.fecha}-${h.nombre}-${i}`}>
                      <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs">{h.fecha}</td>
                      <td className="py-2 pr-4">{h.nombre}</td>
                      <td className="whitespace-nowrap py-2">
                        <Chip estado={h.de} /> <span className="text-muted-foreground">→</span> <Chip estado={h.a} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {datos && (
        <p className="text-xs text-muted-foreground">
          Alertas por correo (falla durante 10 minutos y recuperación) a: {datos.destinatarios.join(', ') || 'nadie'}.
        </p>
      )}
    </div>
  )
}
