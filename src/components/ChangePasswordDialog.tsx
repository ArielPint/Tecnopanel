import { FormEvent, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Button } from '@/modules/financiero/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/financiero/components/ui/dialog'

export default function ChangePasswordDialog({
  open,
  onOpenChange,
  forced = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Primer ingreso (profiles.must_change_password): no se puede cerrar y limpia el flag al guardar. */
  forced?: boolean
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function reset() {
    setPassword('')
    setConfirm('')
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    const { data, error } = await supabase.auth.updateUser({ password })
    if (!error && forced) {
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', data.user.id)
      if (profileErr) {
        setLoading(false)
        setError(profileErr.message)
        return
      }
    }
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (forced) return
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent showCloseButton={!forced}>
        <DialogHeader>
          <DialogTitle>{forced ? 'Cambia tu contraseña' : 'Cambiar contraseña'}</DialogTitle>
          <DialogDescription>
            {forced
              ? 'Es tu primer ingreso, debes establecer una contraseña nueva para continuar.'
              : 'Define tu nueva contraseña de acceso.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Nueva contraseña</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tecnopanel-light"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Confirmar contraseña</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-tecnopanel-light"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando…' : 'Guardar contraseña'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
