import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import CamposIngreso, { Seccion, datosVacios, limpiarDatos, validarDatos } from '../components/CamposIngreso'
import CamposRenta, { rentaVacia } from '../components/CamposRenta'
import { crearIngreso, listarAreas, listarJornadas, miNombre, type Area, type Jornada } from '../lib/api'
import { listarEmpresas, type Empresa } from '@/modules/control_contratistas/lib/api'
import { usePermisosIngreso } from '../hooks/usePermisosIngreso'
import { RUTA } from '../lib/rutas'

/** La llena el área que pide a la persona. La solicitud ya viene aprobada. */
export default function NuevaSolicitud() {
  const navigate = useNavigate()
  const [datos, setDatos] = useState(datosVacios)
  const [renta, setRenta] = useState(rentaVacia)
  const [problema, setProblema] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [areas, setAreas] = useState<Area[] | null>(null)
  const [jornadas, setJornadas] = useState<Jornada[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [solicitante, setSolicitante] = useState<string | null>(null)
  const { tiene, userId } = usePermisosIngreso()

  useEffect(() => {
    listarAreas()
      .then(setAreas)
      .catch((err) => {
        setAreas([])
        toast.error(err instanceof Error ? err.message : 'No se pudieron cargar las áreas')
      })
    listarJornadas()
      .then(setJornadas)
      .catch(() => setJornadas([]))
    listarEmpresas()
      .then(setEmpresas)
      .catch(() => setEmpresas([]))
  }, [])

  useEffect(() => {
    if (userId) miNombre(userId).then(setSolicitante)
  }, [userId])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const p = validarDatos(datos, true)
    setProblema(p)
    if (p) return
    setEnviando(true)
    try {
      const id = await crearIngreso(limpiarDatos(datos), renta)
      toast.success('Solicitud creada. Se avisó al coordinador de la sucursal, a RRHH y a las áreas con tareas.')
      navigate(RUTA.ingreso(id), { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo crear la solicitud'
      // la solicitud quedó creada aunque la renta no: se va al listado, donde ya aparece
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

  if (areas === null) return <div className="h-40 animate-pulse rounded bg-muted" />
  if (!areas.some((a) => a.activa)) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <h1 className="text-xl font-extrabold">Nueva solicitud de ingreso</h1>
        <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          Todavía no hay áreas configuradas para solicitar personal.{' '}
          {tiene('rrhh') ? (
            <>
              Agrégalas en{' '}
              <Link to={RUTA.configuracion} className="font-semibold text-brand hover:underline">
                Configuración
              </Link>
              .
            </>
          ) : (
            'Pide a RRHH que las agregue en Configuración.'
          )}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-5xl space-y-4">
      <Link to={RUTA.inicio} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a ingresos
      </Link>
      <div>
        <h1 className="text-xl font-extrabold">Nueva solicitud de ingreso</h1>
        <p className="text-sm text-muted-foreground">
          Al crearla se avisa por correo al coordinador de la sucursal, a RRHH y a las áreas que tienen tareas. Los documentos del trabajador los carga
          después el coordinador.
        </p>
      </div>

      <CamposIngreso datos={datos} onChange={setDatos} nueva areas={areas} jornadas={jornadas} empresas={empresas} solicitante={solicitante} />

      <Seccion titulo="Renta (opcional)">
        <CamposRenta renta={renta} onChange={setRenta} />
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
