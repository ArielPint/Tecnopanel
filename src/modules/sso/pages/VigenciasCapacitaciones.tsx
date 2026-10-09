import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { listarTiposCapacitacion, listarVigencias, type TipoCapacitacion, type VigenciaCapacitacion } from '../lib/apiCapacitaciones'
import { listarTrabajadores } from '../lib/apiTrabajadores'
import { fmtFecha } from '../lib/estados'
import { RUTA } from '../lib/rutas'
import type { TrabajadorV } from '../lib/tiposTrabajadores'
import { useDatosSso } from '../hooks/useDatosSso'
import { useCatalogosTrabajadores } from '../hooks/useCatalogosTrabajadores'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

const CELDA = {
  vigente: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  por_vencer: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  vencido: 'bg-red-600 text-white',
}
const ETIQUETA = { vigente: 'Vigente', por_vencer: 'Por vencer', vencido: 'Vencida' }

/** Matriz trabajador × curso con vigencia: quién lo tiene al día, quién por vencer y quién vencido.
 *  "—" = nunca lo hizo (no necesariamente le corresponde: depende de su cargo). */
export default function VigenciasCapacitaciones() {
  const { areas } = useDatosSso()
  const { empresas } = useCatalogosTrabajadores()
  const [tipos, setTipos] = useState<TipoCapacitacion[]>([])
  const [trabajadores, setTrabajadores] = useState<TrabajadorV[]>([])
  const [vigencias, setVigencias] = useState<VigenciaCapacitacion[]>([])
  const [loading, setLoading] = useState(true)
  const [areaId, setAreaId] = useState('')
  const [empresaId, setEmpresaId] = useState('')
  const [soloAlertas, setSoloAlertas] = useState(false)

  useEffect(() => {
    Promise.all([listarTiposCapacitacion(), listarTrabajadores(), listarVigencias()])
      .then(([t, tr, v]) => {
        setTipos(t.filter((x) => x.vigencia_meses !== null && x.activo))
        setTrabajadores(tr.filter((x) => x.activo))
        setVigencias(v)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  const mapa = useMemo(() => new Map(vigencias.map((v) => [`${v.trabajador_id}:${v.tipo_id}`, v])), [vigencias])
  // solo los cursos que alguien ya hizo (los demás serían una columna vacía)
  const columnas = tipos.filter((t) => vigencias.some((v) => v.tipo_id === t.id))

  const filas = trabajadores.filter((t) => {
    if (areaId && t.area_id !== areaId) return false
    if (empresaId && t.empresa_id !== empresaId) return false
    if (soloAlertas && !columnas.some((c) => ['vencido', 'por_vencer'].includes(mapa.get(`${t.id}:${c.id}`)?.situacion ?? ''))) return false
    return columnas.some((c) => mapa.has(`${t.id}:${c.id}`)) || !soloAlertas
  })

  const cuenta = (s: 'vencido' | 'por_vencer') =>
    vigencias.filter((v) => v.situacion === s && trabajadores.some((t) => t.id === v.trabajador_id) && columnas.some((c) => c.id === v.tipo_id)).length

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">{cuenta('vencido')} vencidas</span>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {cuenta('por_vencer')} por vencer (30 días)
        </span>
        <span className="text-xs text-muted-foreground">Solo cursos con vigencia. Las charlas e inducciones no vencen.</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className={selectClase} aria-label="Empresa">
          <option value="">Todas las empresas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
        <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={selectClase} aria-label="Área">
          <option value="">Todas las áreas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={soloAlertas} onCheckedChange={(v) => setSoloAlertas(!!v)} /> Solo vencidas o por vencer
        </label>
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-4">
          {columnas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Todavía no hay cursos con vigencia registrados.</p>
          ) : filas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nadie coincide con los filtros.</p>
          ) : (
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="sticky left-0 bg-card py-2 pr-3 font-semibold">Trabajador</th>
                  {columnas.map((c) => (
                    <th key={c.id} className="px-2 py-2 text-center text-xs font-semibold">
                      {c.nombre}
                      <span className="block font-normal text-muted-foreground">{c.vigencia_meses} meses</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="sticky left-0 bg-card py-1.5 pr-3">
                      <Link to={RUTA.trabajador(t.id)} className="font-medium hover:underline">
                        {t.apellidos}, {t.nombres}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {t.cargo ?? 'sin cargo'} · {t.empresa}
                      </span>
                    </td>
                    {columnas.map((c) => {
                      const v = mapa.get(`${t.id}:${c.id}`)
                      return (
                        <td key={c.id} className="px-2 py-1.5 text-center">
                          {v ? (
                            <Link
                              to={RUTA.capacitacion(v.capacitacion_id)}
                              title={`${ETIQUETA[v.situacion]} · hecha el ${fmtFecha(v.fecha)}`}
                              className={cn('inline-block rounded px-2 py-0.5 text-[11px] font-semibold', CELDA[v.situacion])}
                            >
                              {v.situacion === 'vencido' ? 'Vencida ' : ''}
                              {fmtFecha(v.vencimiento)}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
