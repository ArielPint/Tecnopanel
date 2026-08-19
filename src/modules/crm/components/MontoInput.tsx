import { useEffect, useState } from 'react'

interface Props {
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  className?: string
}

// Input de texto que muestra separador de miles (es-CL) mientras se escribe,
// pero entrega/recibe un number | null puro hacia el estado del formulario.
export default function MontoInput({ value, onChange, placeholder, className }: Props) {
  const [raw, setRaw] = useState(value != null ? value.toLocaleString('es-CL') : '')

  useEffect(() => {
    setRaw(value != null ? value.toLocaleString('es-CL') : '')
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '')
    const num = digits ? Number(digits) : null
    setRaw(digits ? Number(digits).toLocaleString('es-CL') : '')
    onChange(num)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={raw}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
    />
  )
}
