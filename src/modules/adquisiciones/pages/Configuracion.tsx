import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import MontoInput from '@/components/MontoInput'
import { usePermisosAdq } from '../hooks/usePermisosAdq'
import { guardarNiveles, listarNiveles, type Nivel } from '../lib/api'

/** Montos desde los que se exige cada nivel de aprobación, por sucursal. Cada jefe de compras, los de la suya. */
export default function Configuracion() {
  const { sucursales } = usePermisosAdq()
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

  const set = (n: Nivel, cambio: Partial<Nivel>) =>
    setNiveles((ns) => ns.map((x) => (x.sucursal === n.sucursal && x.nivel === n.nivel ? { ...x, ...cambio } : x)))
  const cambiados = niveles.filter((n, i) => JSON.stringify(n) !== JSON.stringify(inicial[i]))

  async function guardar() {
    setGuardando(true)
    try {
      await guardarNiveles(cambiados)
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
          Cada sucursal tiene sus montos. Una solicitud necesita todos los niveles activos de su sucursal cuyo monto de inicio sea igual o menor al monto neto de la
          cotización elegida; el nivel 1 aplica siempre. Quién aprueba cada nivel en cada sucursal se asigna en Usuarios, pestaña Adquisiciones.
        </p>
      </div>
      {sucursales.jefe.map((suc) => (
        <Card key={suc}>
          <CardContent className="pt-3">
            <h2 className="text-sm font-bold">{suc}</h2>
            <div className="divide-y">
              {niveles
                .filter((n) => n.sucursal === suc)
                .map((n) => (
                  <div key={n.nivel} className="grid items-center gap-3 py-3 sm:grid-cols-[70px_1fr_200px_90px]">
                    <span className="text-sm font-bold">Nivel {n.nivel}</span>
                    <Input value={n.nombre} onChange={(e) => set(n, { nombre: e.target.value })} aria-label={`Nombre del nivel ${n.nivel} en ${suc}`} />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">desde $</span>
                      <MontoInput
                        value={n.monto_desde}
                        onChange={(v) => set(n, { monto_desde: v ?? 0 })}
                        disabled={n.nivel === 1}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono-tabular disabled:opacity-60"
                        aria-label={`Monto desde el que aplica el nivel ${n.nivel} en ${suc}`}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={n.activo}
                        disabled={n.nivel === 1}
                        onChange={(e) => set(n, { activo: e.target.checked })}
                        className="accent-[hsl(var(--brand))]"
                      />
                      Activo
                    </label>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      ))}
      <div className="flex justify-end">
        <Button disabled={!cambiados.length || guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  )
}
