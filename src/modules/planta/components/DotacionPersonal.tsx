import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/modules/financiero/components/ui/input'
import type { DotacionPersonalRow } from '../lib/supaData'

const PRINCIPALES: { key: keyof DotacionPersonalRow; label: string; className: string }[] = [
  { key: 'administrativos', label: 'Administrativos', className: 'bg-[#2b73ff] dark:bg-[#1f5fbf]' },
  { key: 'supervisores', label: 'Supervisores', className: 'bg-[#ff0004] dark:bg-[#d32f2f]' },
  { key: 'operarios', label: 'Operarios', className: 'bg-[#f09500] dark:bg-[#c8a415]' },
]

const CONTRATISTAS: { key: keyof DotacionPersonalRow; label: string }[] = [
  { key: 'sanitarios', label: 'Sanitarios' },
  { key: 'electricos', label: 'Eléctricos' },
  { key: 'terminaciones', label: 'Terminaciones' },
]

export function DotacionPersonal({
  valores,
  isAdmin,
  guardando,
  onGuardar,
}: {
  valores: DotacionPersonalRow
  isAdmin: boolean
  guardando: boolean
  onGuardar: (valores: DotacionPersonalRow) => Promise<void>
}) {
  const [local, setLocal] = useState(valores)
  useEffect(() => setLocal(valores), [valores])

  async function commit(key: keyof DotacionPersonalRow, texto: string) {
    const n = Math.max(0, parseInt(texto, 10) || 0)
    const next = { ...local, [key]: n }
    setLocal(next)
    if (n === valores[key]) return
    try {
      await onGuardar(next)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar dotación')
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {PRINCIPALES.map((c) => (
          <div key={c.key} className={`rounded-lg p-4 text-white ${c.className}`}>
            <p className="text-[.7rem] font-semibold tracking-wide uppercase opacity-90">{c.label}</p>
            {isAdmin ? (
              <Input
                type="number"
                min={0}
                value={local[c.key]}
                disabled={guardando}
                onChange={(e) => setLocal({ ...local, [c.key]: e.target.value === '' ? 0 : +e.target.value })}
                onBlur={(e) => commit(c.key, e.target.value)}
                className="mt-1 h-8 w-20 border-white/30 bg-white/10 text-2xl font-bold text-white"
              />
            ) : (
              <p className="mt-1 text-2xl font-bold tabular-nums">{local[c.key]}</p>
            )}
          </div>
        ))}
      </div>

      <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Dotación subcontratistas</p>
      <div className="grid grid-cols-3 gap-3">
        {CONTRATISTAS.map((c) => (
          <div key={c.key} className="rounded-lg bg-[#6e6e6e] p-4 text-white">
            <p className="text-[.7rem] font-semibold tracking-wide uppercase opacity-90">{c.label}</p>
            {isAdmin ? (
              <Input
                type="number"
                min={0}
                value={local[c.key]}
                disabled={guardando}
                onChange={(e) => setLocal({ ...local, [c.key]: e.target.value === '' ? 0 : +e.target.value })}
                onBlur={(e) => commit(c.key, e.target.value)}
                className="mt-1 h-8 w-20 border-white/30 bg-white/10 text-2xl font-bold text-white"
              />
            ) : (
              <p className="mt-1 text-2xl font-bold tabular-nums">{local[c.key]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
