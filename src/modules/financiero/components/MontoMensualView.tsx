import { useMemo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import EmptyState from '@/modules/financiero/components/EmptyState'
import TableSkeleton from '@/modules/financiero/components/TableSkeleton'
import FormularioMontoMensual from '@/modules/financiero/components/FormularioMontoMensual'
import GraficoMontoMensual from '@/modules/financiero/components/GraficoMontoMensual'
import type { MontoMensual } from '@/modules/financiero/types/financiero'
import { formatCLP, nombreMes } from '@/modules/financiero/utils/formatters'
import { cn } from '@/lib/utils'

interface CategoriaOpcion {
  value: string
  label: string
}

interface GrupoWip {
  label: string
  categorias: string[]
}

interface MontoMensualViewProps {
  registros: MontoMensual[]
  loading: boolean
  error: string | null
  icon: LucideIcon
  tituloVacio: string
  descripcionVacio: string
  tituloNuevo: string
  tituloEditar: string
  etiquetaGrafico: string
  colorVar: string
  colorClase: string
  puedeEditar: boolean
  categorias?: CategoriaOpcion[]
  grupos?: GrupoWip[]
  onUpsert: (input: {
    id?: string
    mes: number
    anio: number
    monto: number
    observacion: string | null
    categoria?: string
  }) => Promise<MontoMensual>
}

export default function MontoMensualView({
  registros,
  loading,
  error,
  icon,
  tituloVacio,
  descripcionVacio,
  tituloNuevo,
  tituloEditar,
  etiquetaGrafico,
  colorVar,
  colorClase,
  puedeEditar,
  categorias,
  grupos,
  onUpsert,
}: MontoMensualViewProps) {
  const categoriaLabel = useMemo(
    () => new Map((categorias ?? []).map((c) => [c.value, c.label])),
    [categorias],
  )

  const { total, promedio, ultimo, totalesPorGrupo } = useMemo(() => {
    const total = registros.reduce((acc, r) => acc + r.monto, 0)

    const porMes = new Map<string, { mes: number; anio: number; monto: number }>()
    for (const r of registros) {
      const key = `${r.anio}-${r.mes}`
      const acc = porMes.get(key) ?? { mes: r.mes, anio: r.anio, monto: 0 }
      acc.monto += r.monto
      porMes.set(key, acc)
    }
    const meses = [...porMes.values()]
    const promedio = meses.length > 0 ? total / meses.length : 0
    const ultimo = meses.sort((a, b) => b.anio - a.anio || b.mes - a.mes)[0]

    const totalesPorGrupo = (grupos ?? []).map((g) => ({
      label: g.label,
      total: registros.filter((r) => r.categoria && g.categorias.includes(r.categoria)).reduce((acc, r) => acc + r.monto, 0),
    }))

    return { total, promedio, ultimo, totalesPorGrupo }
  }, [registros, grupos])

  if (error) return <p className="text-destructive">{error}</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Total acumulado</p>
          <p className={cn('mt-1 text-2xl font-bold tabular-nums', colorClase)}>{loading ? '—' : formatCLP(total)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Promedio mensual</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{loading ? '—' : formatCLP(promedio)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Último mes cargado</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {loading ? '—' : ultimo ? formatCLP(ultimo.monto) : '—'}
          </p>
          {!loading && ultimo && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {nombreMes(ultimo.mes)} {ultimo.anio}
            </p>
          )}
        </div>
      </div>

      {totalesPorGrupo.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {totalesPorGrupo.map((g) => (
            <div key={g.label} className="rounded-lg border bg-card p-4">
              <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{g.label}</p>
              <p className={cn('mt-1 text-2xl font-bold tabular-nums', colorClase)}>{loading ? '—' : formatCLP(g.total)}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && registros.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <GraficoMontoMensual registros={registros} loading={loading} colorVar={colorVar} etiqueta={etiquetaGrafico} />
        </div>
      )}

      <div className="flex justify-end">
        {puedeEditar && (
          <FormularioMontoMensual
            tituloNuevo={tituloNuevo}
            tituloEditar={tituloEditar}
            categorias={categorias}
            onUpsert={onUpsert}
          />
        )}
      </div>

      {!loading && registros.length === 0 ? (
        <EmptyState icon={icon} title={tituloVacio} description={puedeEditar ? descripcionVacio : undefined} />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                {categorias && <TableHead>Categoría</TableHead>}
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Observación</TableHead>
                {puedeEditar && <TableHead />}
              </TableRow>
            </TableHeader>
            {loading ? (
              <TableSkeleton columns={(categorias ? 1 : 0) + (puedeEditar ? 4 : 3)} />
            ) : (
              <TableBody>
                {registros.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {nombreMes(r.mes)} {r.anio}
                    </TableCell>
                    {categorias && (
                      <TableCell>{r.categoria ? (categoriaLabel.get(r.categoria) ?? r.categoria) : '—'}</TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">{formatCLP(r.monto)}</TableCell>
                    <TableCell className="max-w-96 truncate">{r.observacion ?? '—'}</TableCell>
                    {puedeEditar && (
                      <TableCell>
                        <FormularioMontoMensual
                          registroExistente={r}
                          tituloNuevo={tituloNuevo}
                          tituloEditar={tituloEditar}
                          categorias={categorias}
                          onUpsert={onUpsert}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </div>
      )}
    </div>
  )
}
