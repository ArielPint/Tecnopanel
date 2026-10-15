import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'
import CamposSolicitud, { Seccion, datosVacios, limpiarSolicitud, validarSolicitud } from '../components/CamposSolicitud'
import EditorItems, { itemVacio } from '../components/EditorItems'
import { crearSolicitud, type Item } from '../lib/api'
import { RUTA } from '../lib/rutas'

/** La llena quien necesita la compra. Compras la cotiza y la manda a aprobar. */
export default function NuevaSolicitud() {
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id)
  const [datos, setDatos] = useState(() => datosVacios(null))
  const [items, setItems] = useState<Item[]>([itemVacio()])
  const [problema, setProblema] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Parte con la sucursal de la persona (pestaña Cuenta de Usuarios)
  useEffect(() => {
    if (!userId) return
    supabase
      .from('profiles')
      .select('sucursal')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.sucursal) setDatos((d) => (d.sucursal ? d : { ...d, sucursal: data.sucursal }))
      })
  }, [userId])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const p = validarSolicitud(datos, items, true)
    setProblema(p)
    if (p) return
    setEnviando(true)
    try {
      const id = await crearSolicitud(limpiarSolicitud(datos), items)
      toast.success('Solicitud creada. Se avisó a Compras para que la cotice.')
      navigate(RUTA.solicitud(id), { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo crear la solicitud'
      if (msg.startsWith('La solicitud quedó creada')) {
        toast.warning(msg)
        navigate(RUTA.inicio, { replace: true })
      } else {
        setProblema(msg)
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-5xl space-y-4">
      <Link to={RUTA.inicio} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a solicitudes
      </Link>
      <div>
        <h1 className="text-xl font-extrabold">Nueva solicitud de compra</h1>
        <p className="text-sm text-muted-foreground">
          Al crearla se avisa a Compras de la sucursal. Compras pide las cotizaciones, elige una y la envía a aprobación según el monto. Después de
          crearla puedes adjuntar especificaciones o planos.
        </p>
      </div>

      <CamposSolicitud datos={datos} onChange={setDatos} nueva />

      <Seccion titulo="Ítems" detalle="Escribe para buscar en los artículos de SAP, o describe libremente lo que se necesita. El precio estimado es opcional.">
        <EditorItems items={items} onChange={setItems} />
      </Seccion>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {problema && <p className="mr-auto rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{problema}</p>}
        <Button type="submit" disabled={enviando}>
          {enviando ? 'Creando…' : 'Crear solicitud'}
        </Button>
      </div>
    </form>
  )
}
