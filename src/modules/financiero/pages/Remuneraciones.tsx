import { Users } from 'lucide-react'
import { useAuth } from '@/modules/financiero/hooks/useAuth'
import { useRemuneraciones } from '@/modules/financiero/hooks/useRemuneraciones'
import MontoMensualView from '@/modules/financiero/components/MontoMensualView'

const CATEGORIAS = [
  { value: 'operaciones', label: 'Operaciones' },
  { value: 'administrativos', label: 'Administrativos' },
  { value: 'adm_ventas', label: 'Adm y Ventas' },
]

const GRUPOS = [
  { label: 'Mano de Obra (WIP 20010)', categorias: ['operaciones', 'administrativos'] },
  { label: 'Remuneraciones Adm y Ventas (WIP 30124)', categorias: ['adm_ventas'] },
]

export default function Remuneraciones() {
  const { puedeEditar } = useAuth()
  const { remuneraciones, loading, error, upsertRemuneracion } = useRemuneraciones()

  return (
    <MontoMensualView
      registros={remuneraciones}
      loading={loading}
      error={error}
      icon={Users}
      tituloVacio="Todavía no hay remuneraciones cargadas"
      descripcionVacio='Cargá el primer mes con el botón "Agregar mes".'
      tituloNuevo="Agregar mes"
      tituloEditar="Editar remuneraciones del mes"
      etiquetaGrafico="Remuneraciones"
      colorVar="--warning"
      colorClase="text-warning"
      puedeEditar={puedeEditar('remuneraciones')}
      categorias={CATEGORIAS}
      grupos={GRUPOS}
      onUpsert={upsertRemuneracion}
    />
  )
}
