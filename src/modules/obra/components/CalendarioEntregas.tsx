import { useRef, useState } from 'react'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { ASIGNACION_DEFS, SUBCONTRATO_LABEL, type AsignacionCategoria } from '../lib/categorias'
import { buildEntregaSemanas, DIAS_SEMANA, type EntregaItem, type VentanaSemanas } from '../lib/matrix'

const BADGE_VARIANT: Record<AsignacionCategoria, 'default' | 'secondary' | 'warning' | 'success'> = {
  terminaciones: 'default',
  electrico: 'warning',
  sanitario: 'success',
  ventanas: 'secondary',
}

const CAT_CORTA: Record<AsignacionCategoria, string> = {
  terminaciones: 'Term',
  electrico: 'Eléc',
  sanitario: 'San',
  ventanas: 'Vent',
}

function fmtFecha(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

interface CalendarioEntregasProps {
  entregas: EntregaItem[]
  onEntregaClick?: (item: EntregaItem) => void
  onDiaClick?: (fecha: string) => void
  onMoverEntrega?: (item: EntregaItem, nuevaFecha: string) => void
  esPendiente?: (item: EntregaItem) => boolean
  emptyMessage?: string
  ventana?: VentanaSemanas
}

export default function CalendarioEntregas({ entregas, onEntregaClick, onDiaClick, onMoverEntrega, esPendiente, emptyMessage, ventana }: CalendarioEntregasProps) {
  const semanas = buildEntregaSemanas(entregas, ventana)
  const arrastrando = useRef<EntregaItem | null>(null)
  const [diaDestino, setDiaDestino] = useState<string | null>(null)

  if (!semanas.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyMessage ?? 'Ningún módulo tiene fecha de entrega asignada.'}</p>
  }

  return (
    <div className="space-y-6">
      {semanas.map((semana) => (
        <div key={semana.inicio}>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Semana del {fmtFecha(semana.inicio)}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {semana.dias.map((dia, i) => (
              <Card key={dia.fecha} className={diaDestino === dia.fecha ? 'ring-2 ring-primary' : undefined}>
                <CardContent
                  className={`space-y-1.5 p-2 ${onDiaClick ? 'cursor-pointer hover:bg-accent/40' : ''}`}
                  onClick={onDiaClick ? () => onDiaClick(dia.fecha) : undefined}
                  onDragOver={onMoverEntrega ? (e) => { if (!arrastrando.current) return; e.preventDefault(); setDiaDestino(dia.fecha) } : undefined}
                  onDragLeave={onMoverEntrega ? () => setDiaDestino((prev) => (prev === dia.fecha ? null : prev)) : undefined}
                  onDrop={onMoverEntrega ? (e) => {
                    e.preventDefault()
                    const item = arrastrando.current
                    arrastrando.current = null
                    setDiaDestino(null)
                    if (item && item.fecha !== dia.fecha) onMoverEntrega(item, dia.fecha)
                  } : undefined}
                >
                  <p className="text-center text-xs font-bold">
                    {DIAS_SEMANA[i]}
                    <span className="block text-[.65rem] font-normal text-muted-foreground">{fmtFecha(dia.fecha)}</span>
                  </p>
                  <div className="space-y-1">
                    {dia.items.map((item) => (
                      <div
                        key={`${item.moduloNum}:${item.categoria}`}
                        className={`flex items-center justify-between gap-1 rounded px-1.5 py-1 text-[.7rem] ${item.entregado ? 'bg-success/15' : 'bg-muted'} ${onEntregaClick ? 'cursor-pointer hover:bg-muted-foreground/15' : ''} ${onMoverEntrega ? 'cursor-grab active:cursor-grabbing' : ''} ${esPendiente?.(item) ? 'ring-1 ring-warning' : ''}`}
                        onClick={onEntregaClick ? (e) => { e.stopPropagation(); onEntregaClick(item) } : undefined}
                        draggable={!!onMoverEntrega}
                        onDragStart={onMoverEntrega ? (e) => {
                          arrastrando.current = item
                          e.dataTransfer.effectAllowed = 'move'
                          // Firefox exige setData para que el drop dispare.
                          e.dataTransfer.setData('text/plain', `${item.moduloNum}:${item.categoria}`)
                        } : undefined}
                        onDragEnd={onMoverEntrega ? () => { arrastrando.current = null; setDiaDestino(null) } : undefined}
                        title={onMoverEntrega ? 'Arrastrá a otro día para reprogramar' : undefined}
                      >
                        {item.entregado && (
                          <span className="flex size-3 shrink-0 items-center justify-center rounded-full bg-success text-[.55rem] font-bold text-white" title="Checklist completo">✓</span>
                        )}
                        <span className="truncate">{item.code}</span>
                        <span className="flex shrink-0 items-center gap-0.5">
                          <span className="text-[.6rem] text-muted-foreground">{CAT_CORTA[item.categoria]}</span>
                          <Badge variant={BADGE_VARIANT[item.categoria]} className="px-1.5 py-0 text-[.6rem]">
                            {item.subcontrato ? SUBCONTRATO_LABEL[item.subcontrato] : ASIGNACION_DEFS[item.categoria].label}
                          </Badge>
                        </span>
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
