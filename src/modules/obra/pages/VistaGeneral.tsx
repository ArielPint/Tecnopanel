import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { useObraCrData } from '../hooks/useObraCrData'
import { CAT_LABELS } from '../lib/categorias'
import { buildViewCData, isModuloTerminado } from '../lib/matrix'
import type { ChipEstado } from '../lib/crParser'

function Chip({ status }: { status: ChipEstado }) {
  if (status === 'na') return <span className="mx-auto flex size-4 items-center justify-center rounded-full bg-muted text-[.6rem] text-muted-foreground">–</span>
  const ok = status === 'ok'
  return (
    <span className={`mx-auto flex size-4 items-center justify-center rounded-full text-[.6rem] font-bold ${ok ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>
      {ok ? '✓' : '✕'}
    </span>
  )
}

export default function VistaGeneral() {
  const { modulos: todos, loading, hayCR } = useObraCrData()
  const [filtro, setFiltro] = useState('')

  const modulos = useMemo(() => todos.filter((m) => !isModuloTerminado(m) && m.fechaEntregaFinal), [todos])
  const data = useMemo(() => buildViewCData(modulos), [modulos])

  const grupos = useMemo(() => {
    const out: { categoria: string; span: number }[] = []
    for (const p of data.partidas) {
      const last = out[out.length - 1]
      if (last && last.categoria === p.categoria) last.span++
      else out.push({ categoria: p.categoria, span: 1 })
    }
    return out
  }, [data.partidas])

  const modulosFiltrados = useMemo(() => {
    if (!filtro.trim()) return data.modulos
    const q = filtro.trim()
    return data.modulos.filter((m) => String(m.moduloNum).includes(q))
  }, [data.modulos, filtro])

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
  if (!hayCR) return <p className="py-10 text-center text-sm text-muted-foreground">Sin CR cargado todavía — subilo desde la pestaña Configuración.</p>
  if (!data.partidas.length || !data.modulos.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Sin módulos/partidas en el último CR subido.</p>
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            Vista General <span className="ml-2 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-bold text-warning">{data.modulos.length} módulos</span>
          </h3>
          <Input placeholder="Buscar módulo (ej: 093)" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-8 w-44 text-xs" />
        </div>

        <div className="max-h-[75vh] overflow-auto rounded-md border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th rowSpan={2} className="sticky left-0 top-0 z-30 min-w-24 border-b bg-muted p-1 text-left">Módulo</th>
                {grupos.map((g, i) => (
                  <th key={i} colSpan={g.span} className="sticky top-0 z-20 border-b bg-muted p-1 text-[.6rem] font-bold tracking-wide text-muted-foreground uppercase" title={CAT_LABELS[g.categoria] ?? g.categoria}>
                    {g.span <= 2 ? (CAT_LABELS[g.categoria] ?? g.categoria).slice(0, 4).toUpperCase() : CAT_LABELS[g.categoria] ?? g.categoria}
                  </th>
                ))}
              </tr>
              <tr>
                {data.partidas.map((p) => (
                  <th key={p.nombre} className="sticky top-7 z-20 w-8 border-b bg-muted p-0.5 align-bottom" title={p.nombre}>
                    <span className="block h-52 origin-bottom-left translate-x-3 -rotate-90 whitespace-nowrap text-[.6rem] font-normal text-muted-foreground">{p.nombre}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modulosFiltrados.map((m) => (
                <tr key={m.moduloNum} className="border-b">
                  <td className="sticky left-0 z-10 bg-background p-1 font-medium">{m.code}</td>
                  {data.partidas.map((p) => (
                    <td key={p.nombre} className="p-0.5 text-center">
                      <Chip status={m.estados[p.nombre] ?? 'na'} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
