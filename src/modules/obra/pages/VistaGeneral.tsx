import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { useObraCrData } from '../hooks/useObraCrData'
import { CAT_LABELS } from '../lib/categorias'
import { buildViewCData, isModuloTerminado } from '../lib/matrix'
import type { ChipEstado } from '../lib/crParser'

const GRUPO_COLOR: Record<string, string> = {
  sanitario: 'bg-sky-500',
  electrico: 'bg-teal-500',
  wedo_conbes: 'bg-purple-500',
  ventanas: 'bg-orange-500',
}

function Chip({ status }: { status: ChipEstado }) {
  if (status === 'na') return <span className="mx-auto flex size-5 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">–</span>
  const ok = status === 'ok'
  return (
    <span className={`mx-auto flex size-5 items-center justify-center rounded-full text-xs font-bold text-white ${ok ? 'bg-success' : 'bg-destructive'}`}>
      {ok ? '✓' : '✕'}
    </span>
  )
}

export default function VistaGeneral() {
  const { modulos: todos, loading, hayCR } = useObraCrData()
  const [filtro, setFiltro] = useState('')

  const modulos = useMemo(() => todos.filter((m) => !isModuloTerminado(m)), [todos])
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
          <table className="border-separate border-spacing-0 text-xs" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: 64 }} />
              {data.partidas.map((p) => <col key={p.nombre} />)}
            </colgroup>
            <thead>
              <tr className="sticky top-0 z-20 h-16 bg-muted">
                <th rowSpan={2} className="sticky left-0 z-30 min-w-16 border-b bg-muted p-2 text-left text-xs font-bold text-foreground uppercase">Módulo</th>
                {grupos.map((g, i) => (
                  <th
                    key={i}
                    colSpan={g.span}
                    className={`overflow-hidden border-b border-background/40 p-1 text-[.6rem] leading-tight font-bold break-words tracking-wide text-white uppercase ${GRUPO_COLOR[g.categoria] ?? 'bg-muted-foreground'}`}
                    title={CAT_LABELS[g.categoria] ?? g.categoria}
                  >
                    {CAT_LABELS[g.categoria] ?? g.categoria}
                  </th>
                ))}
              </tr>
              <tr className="sticky top-16 z-20 bg-muted">
                {data.partidas.map((p) => (
                  <th key={p.nombre} className="border-b bg-muted px-0 py-2 text-center align-bottom" title={p.nombre}>
                    <span
                      className="inline-block whitespace-nowrap text-xs font-normal text-muted-foreground"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                    >
                      {p.nombre}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modulosFiltrados.map((m) => (
                <tr key={m.moduloNum} className="border-b">
                  <td className="sticky left-0 z-10 bg-background p-2 font-semibold text-sky-600 dark:text-sky-400">{m.code}</td>
                  {data.partidas.map((p) => (
                    <td key={p.nombre} className="p-1.5 text-center">
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
