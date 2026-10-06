import type { OpcionDestino } from '../lib/destinos'
import { selectClase } from './comunes'

/** Proyecto de una línea: obras del hub y proyectos propios del portal, en dos grupos. Los
 *  desactivados no se ofrecen, salvo el que ya tiene elegido (al corregir un registro). */
export default function SelectorDestino({
  destinos,
  valor,
  onChange,
  vacio,
  todos = false,
  className = '',
  ...rest
}: {
  destinos: { obras: OpcionDestino[]; propios: OpcionDestino[] }
  valor: string
  onChange: (valor: string) => void
  /** texto de la opción sin proyecto */
  vacio: string
  /** también los desactivados (para filtrar producción pasada) */
  todos?: boolean
  className?: string
  'aria-label'?: string
}) {
  const visibles = (ops: OpcionDestino[]) => ops.filter((o) => todos || o.activo || o.valor === valor)
  const obras = visibles(destinos.obras)
  const propios = visibles(destinos.propios)
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} className={`${selectClase} ${className}`} {...rest}>
      <option value="">{vacio}</option>
      {obras.length > 0 && (
        <optgroup label="Obras">
          {obras.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.nombre}
            </option>
          ))}
        </optgroup>
      )}
      {propios.length > 0 && (
        <optgroup label="Proyectos">
          {propios.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.nombre}
              {o.activo ? '' : ' (desactivado)'}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}
