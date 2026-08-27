import * as React from "react"

import { cn } from "@/lib/utils"

interface InputProps extends React.ComponentProps<"input"> {
  // Formatea el valor con separador de miles (es-CL) mientras se muestra,
  // pero sigue entregando el string de solo dígitos vía onChange/e.target.value.
  thousands?: boolean
}

function Input({ className, type, onWheel, thousands, value, onChange, ...props }: InputProps) {
  const displayValue = thousands && value !== '' && value != null
    ? Number(String(value).replace(/\D/g, '')).toLocaleString('es-CL')
    : value

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (thousands) e.target.value = e.target.value.replace(/\D/g, '')
    onChange?.(e)
  }

  return (
    <input
      type={thousands ? "text" : type}
      inputMode={thousands ? "numeric" : undefined}
      data-slot="input"
      onWheel={type === "number" ? (e) => e.currentTarget.blur() : onWheel}
      value={displayValue}
      onChange={handleChange}
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        type === "number" && "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className
      )}
      {...props}
    />
  )
}

export { Input }
