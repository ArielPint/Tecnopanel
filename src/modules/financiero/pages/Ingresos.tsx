import { TrendingUp } from 'lucide-react'
import { useAuth } from '@/modules/financiero/hooks/useAuth'
import { useIngresos } from '@/modules/financiero/hooks/useIngresos'
import MontoMensualView from '@/modules/financiero/components/MontoMensualView'

export default function Ingresos() {
  const { puedeEditar } = useAuth()
  const { ingresos, loading, error, upsertIngreso } = useIngresos()

  return (
    <MontoMensualView
      registros={ingresos}
      loading={loading}
      error={error}
      icon={TrendingUp}
      tituloVacio="Todavía no hay ingresos cargados"
      descripcionVacio='Cargá el primer mes con el botón "Agregar mes".'
      tituloNuevo="Agregar mes"
      tituloEditar="Editar ingreso del mes"
      etiquetaGrafico="Ingreso"
      colorVar="--success"
      colorClase="text-success"
      puedeEditar={puedeEditar('ingresos')}
      onUpsert={upsertIngreso}
    />
  )
}
