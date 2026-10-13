import type { Destinos, OpcionDestino } from '../lib/destinos'
import { selectClase } from './comunes'

/** Proyecto de una línea: proyectos de SAP, obras del hub y proyectos propios del portal, en tres
 *  grupos. Los desactivados (o cerrados en SAP) no se ofrecen, salvo el que ya tiene elegido (al
 *  corregir un registro). */
export default function SelectorDestino({
  destinos,
  valor,
  onChange,
  vacio,
  todos = false,
  className = '',
  ...rest
}: {
  destinos: Destinos
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
  const sap = visibles(destinos.sap)
  const obras = visibles(destinos.obras)
  const propios = visibles(destinos.propios)
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} className={`${selectClase} ${className}`} {...rest}>
      <option value="">{vacio}</option>
      {sap.length > 0 && (
        <optgroup label="Proyectos SAP">
          {sap.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.nombre}
              {o.activo ? '' : ' (cerrado en SAP)'}
            </option>
          ))}
        </optgroup>
      )}
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
        <optgroup label="Proyectos del portal">
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
