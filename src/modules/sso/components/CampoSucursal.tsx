import { SUCURSALES, type Sucursal } from '@/lib/lineasNegocio'
import { Label } from '@/modules/financiero/components/ui/label'
import { useSucursalSso } from '../hooks/useSucursalSso'
import type { Area } from '../lib/tipos'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60'

/** Sucursal de un registro nuevo: la que se está mirando, o la del área si ya se eligió una. */
export function sucursalInicial(porDefecto: Sucursal | null, areas: Area[], areaId: string | null | undefined): Sucursal | null {
  return areas.find((a) => a.id === areaId)?.sucursal ?? porDefecto
}

interface Props {
  id: string
  value: Sucursal | null
  onChange: (s: Sucursal | null) => void
  /** con área, la sucursal es la del área (la base la fija igual) */
  areaId?: string | null
  areas?: Area[]
  /** documentos: vacío = de las dos sucursales */
  permitirAmbas?: boolean
}

/** Campo "Sucursal" de los formularios. Quien tiene sucursal propia no puede elegir otra. */
export default function CampoSucursal({ id, value, onChange, areaId, areas = [], permitirAmbas }: Props) {
  const { fija } = useSucursalSso()
  const deArea = areas.find((a) => a.id === areaId)?.sucursal ?? null
  const actual = deArea ?? fija ?? value
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Sucursal{permitirAmbas || deArea ? '' : ' *'}</Label>
      <select
        id={id}
        value={actual ?? ''}
        onChange={(e) => onChange((e.target.value || null) as Sucursal | null)}
        disabled={!!deArea || !!fija}
        className={selectClase}
        title={deArea ? 'La del área' : undefined}
      >
        <option value="">{permitirAmbas ? 'Las dos sucursales' : 'Selecciona…'}</option>
        {SUCURSALES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  )
}
