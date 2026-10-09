import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { borrarDotacion, guardarDotacion, listarDotacion, mesesEntre, type Dotacion } from '../lib/apiAccidentes'
import { hoyChile } from '../lib/estados'
import { etiquetaMes } from '../lib/indicadores'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useCatalogosTrabajadores } from '../hooks/useCatalogosTrabajadores'

const selectClase =
  'flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

/** Dotación promedio y horas-hombre por mes y por empresa (se ingresan a mano). Base de las tasas. */
export default function DotacionMensual() {
  const { puede } = usePermisosSso('accidentes')
  const editable = puede('aprobar')
  const { empresas } = useCatalogosTrabajadores()
  const [filas, setFilas] = useState<Dotacion[]>([])
  const [empresaId, setEmpresaId] = useState('')
  const [anio, setAnio] = useState(hoyChile().slice(0, 4))
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    try {
      setFilas(await listarDotacion())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    cargar()
  }, [cargar])
  useEffect(() => {
    if (!empresaId && empresas.length) setEmpresaId(empresas.find((e) => e.propia)?.id ?? empresas[0].id)
  }, [empresas, empresaId])

  const hoy = hoyChile()
  const meses = useMemo(() => mesesEntre(`${anio}-01-01`, anio === hoy.slice(0, 4) ? hoy : `${anio}-12-01`), [anio, hoy])
  const anios = useMemo(() => {
    const desde = Math.min(+hoy.slice(0, 4) - 1, ...filas.map((f) => +f.mes.slice(0, 4)))
    return Array.from({ length: +hoy.slice(0, 4) - desde + 1 }, (_, i) => String(+hoy.slice(0, 4) - i))
  }, [filas, hoy])
  const de = (mes: string) => filas.find((f) => f.empresa_id === empresaId && f.mes.startsWith(mes))

  async function guardar(mes: string, campo: 'trabajadores' | 'horas_hombre', valor: string) {
    const actual = de(mes)
    const n = valor.trim() === '' ? null : Number(valor.replace(',', '.'))
    if (n !== null && (Number.isNaN(n) || n < 0)) {
      toast.error('Valor inválido')
      return
    }
    const nueva = { trabajadores: actual?.trabajadores ?? 0, horas_hombre: actual?.horas_hombre ?? 0, [campo]: n ?? 0 }
    if (Number(actual?.[campo] ?? -1) === (n ?? 0) && actual) return
    try {
      if (n === null && actual && Number(nueva.trabajadores) === 0 && Number(nueva.horas_hombre) === 0) await borrarDotacion(actual.mes, empresaId)
      else await guardarDotacion({ mes: `${mes}-01`, empresa_id: empresaId, trabajadores: Number(nueva.trabajadores), horas_hombre: Number(nueva.horas_hombre) })
      await cargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  if (loading) return <div className="h-40 animate-pulse rounded bg-muted" />

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Dotación promedio del mes y horas-hombre trabajadas, por empresa: las tasas de Tecnopanel y de cada contratista se calculan
        aparte. {editable ? 'Se guarda al salir de cada casilla.' : 'Solo Prevención puede cargarlas.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className={selectClase} aria-label="Empresa">
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
              {e.propia ? '' : ' (contratista)'}
            </option>
          ))}
        </select>
        <select value={anio} onChange={(e) => setAnio(e.target.value)} className={selectClase} aria-label="Año">
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="w-48">Dotación promedio</TableHead>
                <TableHead className="w-48">Horas-hombre</TableHead>
                <TableHead>HH por trabajador</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meses.map((m) => {
                const d = de(m)
                return (
                  <TableRow key={`${empresaId}:${m}`}>
                    <TableCell className="font-medium">{etiquetaMes(m)}</TableCell>
                    <TableCell>
                      <Input
                        key={`t-${empresaId}-${m}-${d?.trabajadores ?? ''}`}
                        type="number"
                        min={0}
                        step="0.1"
                        className="h-8 w-32"
                        defaultValue={d?.trabajadores ?? ''}
                        placeholder="Falta"
                        disabled={!editable}
                        onBlur={(e) => e.target.value !== String(d?.trabajadores ?? '') && guardar(m, 'trabajadores', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        key={`h-${empresaId}-${m}-${d?.horas_hombre ?? ''}`}
                        type="number"
                        min={0}
                        step="1"
                        className="h-8 w-36"
                        defaultValue={d?.horas_hombre ?? ''}
                        placeholder="Falta"
                        disabled={!editable}
                        onBlur={(e) => e.target.value !== String(d?.horas_hombre ?? '') && guardar(m, 'horas_hombre', e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="font-mono-tabular text-muted-foreground">
                      {d && Number(d.trabajadores) > 0 ? Math.round(Number(d.horas_hombre) / Number(d.trabajadores)) : ''}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
