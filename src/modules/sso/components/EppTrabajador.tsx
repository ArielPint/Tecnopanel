import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { cn } from '@/lib/utils'
import { MOTIVO_LABEL, listarCatalogoEpp, listarEntregas, listarEppVigentes, type ElementoEpp, type EntregaV, type EppVigente } from '../lib/apiEpp'
import { fmtFecha } from '../lib/estados'
import { RUTA } from '../lib/rutas'

const CLASE = {
  vigente: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  por_vencer: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  vencido: 'bg-red-600 text-white',
}

/** Sección de la ficha del trabajador: lo que tiene hoy (con su reposición) y el historial de entregas. */
export function EppTrabajador({ trabajadorId, puedeEntregar }: { trabajadorId: string; puedeEntregar: boolean }) {
  const [vigentes, setVigentes] = useState<EppVigente[]>([])
  const [entregas, setEntregas] = useState<EntregaV[]>([])
  const [catalogo, setCatalogo] = useState<ElementoEpp[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([listarEppVigentes(trabajadorId), listarEntregas(trabajadorId), listarCatalogoEpp()])
      .then(([v, e, c]) => {
        setVigentes(v)
        setEntregas(e)
        setCatalogo(c)
      })
      .finally(() => setLoading(false))
  }, [trabajadorId])

  const cat = new Map(catalogo.map((c) => [c.id, c]))
  const orden = { vencido: 0, por_vencer: 1, vigente: 2 }
  const actuales = [...vigentes].sort((a, b) => orden[a.situacion] - orden[b.situacion] || (cat.get(a.epp_id)?.nombre ?? '').localeCompare(cat.get(b.epp_id)?.nombre ?? ''))

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">Elementos de protección personal</p>
          {puedeEntregar && (
            <Button asChild size="sm" variant="outline">
              <Link to={RUTA.nuevaEntrega(trabajadorId)}>
                <Plus className="mr-1 h-4 w-4" /> Registrar entrega
              </Link>
            </Button>
          )}
        </div>
        {loading ? (
          <div className="h-16 animate-pulse rounded bg-muted" />
        ) : actuales.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin entregas registradas.</p>
        ) : (
          <>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {actuales.map((v) => (
                <li key={v.epp_id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{cat.get(v.epp_id)?.nombre}</span>
                    <span className="block text-xs text-muted-foreground">
                      Entregado {fmtFecha(v.fecha)}
                      {v.talla && ` · talla ${v.talla}`}
                    </span>
                  </span>
                  <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', CLASE[v.situacion])}>
                    {v.reposicion ? `${v.situacion === 'vencido' ? 'Venció' : 'Repone'} ${fmtFecha(v.reposicion)}` : 'Por deterioro'}
                  </span>
                </li>
              ))}
            </ul>
            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Historial: {entregas.length} entregas</summary>
              <ul className="mt-2 divide-y">
                {entregas.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-1.5">
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">{fmtFecha(e.fecha)}</span>
                    <Link to={RUTA.entrega(e.id)} className="flex-1 hover:underline">
                      {MOTIVO_LABEL[e.motivo]} · {e.unidades} {Number(e.unidades) === 1 ? 'unidad' : 'unidades'}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  )
}
