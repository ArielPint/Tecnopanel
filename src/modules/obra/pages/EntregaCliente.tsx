import { useMemo } from 'react'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { useObraCrData } from '../hooks/useObraCrData'
import { buildEntregaSemanas, DIAS_SEMANA } from '../lib/matrix'

function fmtFecha(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export default function EntregaCliente() {
  const { modulos, loading, hayCR } = useObraCrData()
  const semanas = useMemo(() => buildEntregaSemanas(modulos), [modulos])

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
  if (!hayCR) return <p className="py-10 text-center text-sm text-muted-foreground">Sin CR cargado todavía — subilo desde la pestaña Configuración.</p>
  if (!semanas.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Ningún módulo tiene fecha de entrega final cargada en Configuración.</p>
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">Calendario armado a partir de la fecha de entrega final cargada por módulo en la pestaña Configuración.</p>
      {semanas.map((semana) => (
        <div key={semana.inicio}>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Semana del {fmtFecha(semana.inicio)}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {semana.dias.map((dia, i) => (
              <Card key={dia.fecha}>
                <CardContent className="space-y-1.5 p-2">
                  <p className="text-center text-xs font-bold">
                    {DIAS_SEMANA[i]}
                    <span className="block text-[.65rem] font-normal text-muted-foreground">{fmtFecha(dia.fecha)}</span>
                  </p>
                  <div className="space-y-1">
                    {dia.modulos.map((m) => (
                      <div key={m.moduloNum} className="flex items-center justify-between gap-1 rounded bg-muted px-1.5 py-1 text-[.7rem]">
                        <span>{m.code}</span>
                        {m.subcontrato && <Badge variant={m.subcontrato === 'W' ? 'default' : 'secondary'} className="px-1.5 py-0 text-[.6rem]">{m.subcontrato}</Badge>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
