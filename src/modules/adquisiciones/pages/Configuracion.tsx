import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import MontoInput from '@/components/MontoInput'
import { guardarNiveles, listarNiveles, type Nivel } from '../lib/api'

/** Montos desde los que se exige cada nivel de aprobación. Solo el jefe de compras. */
export default function Configuracion() {
  const [niveles, setNiveles] = useState<Nivel[]>([])
  const [inicial, setInicial] = useState<Nivel[]>([])
  const [guardando, setGuardando] = useState(false)

  const cargar = () =>
    listarNiveles()
      .then((n) => {
        setNiveles(n)
        setInicial(n)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))

  useEffect(() => {
    cargar()
  }, [])

  const set = (i: number, cambio: Partial<Nivel>) => setNiveles((ns) => ns.map((n, j) => (j === i ? { ...n, ...cambio } : n)))
  const cambiados = niveles.filter((n, i) => JSON.stringify(n) !== JSON.stringify(inicial[i]))

  async function guardar() {
    setGuardando(true)
    try {
      await guardarNiveles(niveles)
      toast.success('Niveles guardados. Rigen para las solicitudes que se envíen a aprobación desde ahora.')
      await cargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
      await cargar()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Niveles de aprobación</h1>
        <p className="text-sm text-muted-foreground">
          Una solicitud necesita todos los niveles activos cuyo monto de inicio sea igual o menor al monto neto de la cotización elegida. El nivel 1 aplica
          siempre. Quién aprueba cada nivel se asigna en Usuarios, pestaña Adquisiciones.
        </p>
      </div>
      <Card>
        <CardContent className="divide-y pt-2">
          {niveles.map((n, i) => (
            <div key={n.nivel} className="grid items-center gap-3 py-3 sm:grid-cols-[70px_1fr_200px_90px]">
              <span className="text-sm font-bold">Nivel {n.nivel}</span>
              <Input value={n.nombre} onChange={(e) => set(i, { nombre: e.target.value })} aria-label={`Nombre del nivel ${n.nivel}`} />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">desde $</span>
                <MontoInput
                  value={n.monto_desde}
                  onChange={(v) => set(i, { monto_desde: v ?? 0 })}
                  disabled={n.nivel === 1}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono-tabular disabled:opacity-60"
                  aria-label={`Monto desde el que aplica el nivel ${n.nivel}`}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={n.activo}
                  disabled={n.nivel === 1}
                  onChange={(e) => set(i, { activo: e.target.checked })}
                  className="accent-[hsl(var(--brand))]"
                />
                Activo
              </label>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button disabled={!cambiados.length || guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  )
}
