import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/modules/financiero/components/ui/button'
import { cn } from '@/lib/utils'
import type { FilaEstado } from '../lib/balance'

// Tabla de un estado financiero (balance de SAP o situación financiera IFRS): filas desplegables, una
// columna por corte, variación si hay comparativo y clic en las cifras de cuentas para ver movimientos.

const NUM = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })
const fmt = (v: number | undefined) => (v === undefined || Math.round(v) === 0 ? '–' : NUM.format(v))

interface Props {
  filas: FilaEstado[]
  /** clave 'YYYY-MM' y su encabezado */
  cortes: { clave: string; etiqueta: string }[]
  /** Clic en la cifra de una fila con cuentas (corte = clave) */
  onDetalle?: (fila: FilaEstado, corte: string) => void
  /** Botones extra a la derecha de "Expandir / Contraer" */
  acciones?: React.ReactNode
}

export default function TablaEstado({ filas, cortes, onDetalle, acciones }: Props) {
  const abiertosIniciales = useMemo(() => new Set(filas.filter((f) => f.tipo === 'seccion').map((f) => f.id)), [filas])
  const [abiertos, setAbiertos] = useState<Set<string>>(abiertosIniciales)
  // al cambiar de estado (otra estructura), vuelve a abrir solo las secciones
  const firma = filas.map((f) => f.id).join('|')
  useEffect(() => setAbiertos(abiertosIniciales), [firma]) // eslint-disable-line react-hooks/exhaustive-deps

  const padres = useMemo(() => new Map(filas.map((f) => [f.id, f.padreId])), [filas])
  const visible = (f: FilaEstado) => {
    for (let p = f.padreId; p; p = padres.get(p) ?? null) if (!abiertos.has(p)) return false
    return true
  }
  const alternar = (id: string) =>
    setAbiertos((a) => {
      const n = new Set(a)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const conVariacion = cortes.length === 2

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAbiertos(new Set(filas.filter((f) => f.tieneHijos).map((f) => f.id)))}>
            <ChevronsUpDown className="mr-1 h-4 w-4" /> Expandir todo
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAbiertos(abiertosIniciales)}>
            <ChevronsDownUp className="mr-1 h-4 w-4" /> Contraer
          </Button>
        </div>
        {acciones}
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="sticky left-0 z-10 min-w-[200px] bg-muted px-3 py-2 text-left font-semibold sm:min-w-[340px]">Cuenta</th>
              {cortes.map((c) => (
                <th key={c.clave} className="whitespace-nowrap px-3 py-2 text-right font-semibold">{c.etiqueta}</th>
              ))}
              {conVariacion && <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Variación</th>}
              {conVariacion && <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">%</th>}
            </tr>
          </thead>
          <tbody>
            {filas.filter(visible).map((f) => {
              const resaltada = f.tipo === 'seccion' || f.tipo === 'subtotal' || f.tipo === 'total'
              const control = f.tipo === 'control'
              const clic = !!onDetalle && f.cuentas.length > 0
              const celda = 'whitespace-nowrap px-3 py-1.5 text-right tabular-nums'
              const actual = f.valores[cortes[0]?.clave] ?? 0
              const anterior = conVariacion ? (f.valores[cortes[1].clave] ?? 0) : 0
              const variacion = actual - anterior
              return (
                <tr
                  key={f.id}
                  className={cn(
                    'border-b last:border-0',
                    // fondos sólidos: la primera columna es fija y no debe transparentar lo que pasa por debajo
                    f.tipo === 'seccion' && 'bg-muted font-semibold',
                    f.tipo === 'subtotal' && 'bg-accent font-bold',
                    f.tipo === 'total' && 'bg-accent font-extrabold',
                    f.tipo === 'resultado' && 'italic',
                    control && 'text-xs text-muted-foreground',
                  )}
                >
                  <td
                    className={cn('sticky left-0 z-10 px-3 py-1.5', resaltada ? 'bg-inherit' : 'bg-card')}
                    style={{ paddingLeft: 12 + f.profundidad * 16 }}
                  >
                    <div className="flex items-center gap-1">
                      {f.tieneHijos ? (
                        <button onClick={() => alternar(f.id)} className="text-muted-foreground hover:text-foreground" aria-label="Abrir o cerrar">
                          {abiertos.has(f.id) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      ) : (
                        <span className="w-3.5" />
                      )}
                      {f.codigo && <span className="mr-1 text-[11px] text-muted-foreground">{f.codigo}</span>}
                      <span className={cn('whitespace-nowrap', resaltada && 'uppercase tracking-wide', f.tipo === 'cuenta' && 'font-normal')}>{f.nombre}</span>
                    </div>
                  </td>
                  {cortes.map((c) => {
                    const v = f.valores[c.clave]
                    return (
                      <td key={c.clave} className={cn(celda, control && Math.round(v ?? 0) !== 0 && 'font-bold text-destructive')}>
                        {clic && v ? (
                          <button className="hover:text-brand hover:underline" onClick={() => onDetalle!(f, c.clave)}>
                            {fmt(v)}
                          </button>
                        ) : control ? (
                          Math.round(v ?? 0) === 0 ? '0 ✓' : fmt(v)
                        ) : (
                          fmt(v)
                        )}
                      </td>
                    )
                  })}
                  {conVariacion && <td className={cn(celda, 'text-muted-foreground')}>{control ? '' : fmt(variacion)}</td>}
                  {conVariacion && (
                    <td className={cn(celda, 'text-muted-foreground')}>
                      {control || !anterior || Math.round(variacion) === 0 ? '' : `${((variacion / Math.abs(anterior)) * 100).toFixed(1)}%`}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
