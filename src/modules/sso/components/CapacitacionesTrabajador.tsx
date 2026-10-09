import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { cn } from '@/lib/utils'
import { listarCapacitacionesDeTrabajador, listarVigencias, type CapacitacionV, type VigenciaCapacitacion } from '../lib/apiCapacitaciones'
import { fmtFecha } from '../lib/estados'
import { RUTA } from '../lib/rutas'

const CLASE = {
  vigente: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  por_vencer: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  vencido: 'bg-red-600 text-white',
}
const LABEL = { vigente: 'Vigente', por_vencer: 'Por vencer', vencido: 'Vencida' }

/** Sección de la ficha del trabajador: cursos con vigencia y el historial de asistencia. */
export function CapacitacionesTrabajador({ trabajadorId }: { trabajadorId: string }) {
  const [historial, setHistorial] = useState<(CapacitacionV & { asistio: boolean })[]>([])
  const [vigencias, setVigencias] = useState<VigenciaCapacitacion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listarCapacitacionesDeTrabajador(trabajadorId), listarVigencias(trabajadorId)])
      .then(([h, v]) => {
        setHistorial(h)
        setVigencias(v)
      })
      .finally(() => setLoading(false))
  }, [trabajadorId])

  // vigencias de cursos que vencen (las charlas no vencen y no aportan aquí)
  const conVencimiento = vigencias.filter((v) => v.vencimiento)
  const tipoDe = new Map(historial.map((h) => [h.tipo_id, h.tipo]))
  const horas = historial.filter((h) => h.asistio).reduce((s, h) => s + h.duracion_min, 0) / 60

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">Capacitaciones</p>
          {historial.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {historial.filter((h) => h.asistio).length} asistencias · {horas.toLocaleString('es-CL', { maximumFractionDigits: 1 })} horas
            </p>
          )}
        </div>
        {loading ? (
          <div className="h-16 animate-pulse rounded bg-muted" />
        ) : historial.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin capacitaciones registradas.</p>
        ) : (
          <>
            {conVencimiento.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {conVencimiento.map((v) => (
                  <div key={v.tipo_id} className="rounded-md border px-3 py-2 text-sm">
                    <p className="font-semibold">{tipoDe.get(v.tipo_id) ?? 'Curso'}</p>
                    <p className="text-xs text-muted-foreground">
                      Hecho {fmtFecha(v.fecha)} · vence {fmtFecha(v.vencimiento)}
                    </p>
                    <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold', CLASE[v.situacion])}>{LABEL[v.situacion]}</span>
                  </div>
                ))}
              </div>
            )}
            <ul className="divide-y">
              {historial.map((h) => (
                <li key={h.id} className={cn('flex items-center gap-3 py-1.5 text-sm', !h.asistio && 'opacity-60')}>
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{fmtFecha(h.fecha)}</span>
                  <Link to={RUTA.capacitacion(h.id)} className="min-w-0 flex-1 truncate hover:underline">
                    {h.tema}
                    <span className="ml-1 text-xs text-muted-foreground">· {h.tipo}</span>
                  </Link>
                  {!h.asistio && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">Ausente</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
