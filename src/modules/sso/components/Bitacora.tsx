import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { comentar } from '../lib/api'
import { ESTADO_META, fmtFechaHora } from '../lib/estados'
import type { EventoBitacora } from '../lib/tipos'

function describir(e: EventoBitacora): string {
  switch (e.evento) {
    case 'creado':
      return 'Reportó el hallazgo'
    case 'estado':
      return `Cambió el estado: ${e.estado_anterior ? ESTADO_META[e.estado_anterior].label : '—'} → ${e.estado_nuevo ? ESTADO_META[e.estado_nuevo].label : '—'}`
    case 'responsable':
      return 'Cambió el responsable'
    case 'plazo':
      return 'Cambió el plazo'
    case 'accion_correctiva':
      return 'Registró la acción correctiva'
    case 'evidencia':
      return 'Agregó una foto'
    case 'comentario':
      return 'Comentó'
  }
}

interface Props {
  hallazgoId: string
  eventos: EventoBitacora[]
  userId: string
  nombreUsuario: (id: string | null) => string
  onCambio: () => void
}

export function Bitacora({ hallazgoId, eventos, userId, nombreUsuario, onCambio }: Props) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar() {
    if (!texto.trim()) return
    setEnviando(true)
    try {
      await comentar(hallazgoId, texto, userId)
      setTexto('')
      onCambio()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el comentario')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold">Bitácora</p>
      <ol className="space-y-3 border-l pl-4">
        {eventos.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-muted-foreground" />
            <p className="text-sm">
              <span className="font-semibold">{nombreUsuario(e.user_id)}</span> · {describir(e)}
            </p>
            {e.comentario && e.evento !== 'creado' && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{e.comentario}</p>
            )}
            <p className="text-[11px] text-muted-foreground">{fmtFechaHora(e.created_at)}</p>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2">
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Agregar un comentario" rows={2} />
        <Button type="button" size="sm" variant="outline" className="self-end" onClick={enviar} disabled={enviando || !texto.trim()}>
          Comentar
        </Button>
      </div>
    </div>
  )
}
