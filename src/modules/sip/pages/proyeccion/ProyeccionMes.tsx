import { useEffect, useMemo, useState } from 'react'
import { Copy, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import type { Sucursal } from '@/lib/lineasNegocio'
import { Cargando, Vacio } from '../../components/comunes'
import { SelectorMes, fmtEntrada, leerNumero, leerPesos, useMesProy } from '../../components/proyeccion'
import { fmtPesos } from '../../lib/cortes'
import { fmtNum } from '../../lib/formato'
import {
  fmtMes,
  fmtRango,
  guardarDias,
  guardarMes,
  listarDias,
  listarLineasProy,
  listarMes,
  semanasDelMes,
  sumarMeses,
  type LineaProy,
} from '../../lib/proyeccion'
import { usePermisosSip } from '../../hooks/usePermisosSip'
import { useSucursalSip } from '../../hooks/useSucursalSip'

/** Proyección del mes por línea de negocio (en pesos de venta) y días hábiles de cada semana. */
export default function ProyeccionMes() {
  const { sucursal } = useSucursalSip()
  const { mes } = useMesProy()
  const { puedeEn } = usePermisosSip()
  const editor = puedeEn('proyeccion', 'editar')
  const suc: Sucursal | null = sucursal === 'todas' ? null : sucursal
  const semanas = useMemo(() => semanasDelMes(mes), [mes])

  const [lineas, setLineas] = useState<LineaProy[] | null>(null)
  const [montos, setMontos] = useState<Record<string, { monto: string; nota: string }>>({})
  const [dias, setDias] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!suc) return
    let cancelado = false
    setLineas(null)
    Promise.all([listarLineasProy(), listarMes(mes, suc), listarDias(mes, suc)])
      .then(([l, m, d]) => {
        if (cancelado) return
        setLineas(l)
        setMontos(Object.fromEntries(m.map((x) => [x.linea_codigo, { monto: String(Math.round(x.monto)), nota: x.nota ?? '' }])))
        setDias(Object.fromEntries(d.map((x) => [x.semana, fmtEntrada(x.dias, 1)])))
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Error al cargar')
        if (!cancelado) setLineas([])
      })
    return () => {
      cancelado = true
    }
  }, [suc, mes, recarga])

  if (!suc) return <Vacio>Elige una sucursal arriba (Santiago o Puerto Varas): cada una lleva su propia proyección.</Vacio>
  if (!lineas) return <Cargando />

  const total = lineas.reduce((t, l) => t + (leerPesos(montos[l.codigo]?.monto ?? '') || 0), 0)
  const diasMes = semanas.reduce((t, s) => {
    const d = leerNumero(dias[s.semana] ?? '')
    return t + (d == null || Number.isNaN(d) ? s.diasDefecto : d)
  }, 0)

  const copiarAnterior = async () => {
    try {
      const anterior = await listarMes(sumarMeses(mes, -1), suc)
      if (anterior.length === 0) {
        toast.info(`${fmtMes(sumarMeses(mes, -1))} no tiene proyección en ${suc}`)
        return
      }
      setMontos(Object.fromEntries(anterior.map((x) => [x.linea_codigo, { monto: String(Math.round(x.monto)), nota: x.nota ?? '' }])))
      toast.success('Copiada la proyección del mes anterior: revísala y guarda')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al copiar')
    }
  }

  const guardar = async () => {
    const filas = []
    for (const l of lineas) {
      const v = montos[l.codigo]
      const monto = leerPesos(v?.monto ?? '')
      if (monto != null && (Number.isNaN(monto) || monto < 0)) {
        toast.error(`El monto de ${l.nombre} no es válido`)
        return
      }
      filas.push({ linea_codigo: l.codigo, monto, nota: v?.nota.trim() || null })
    }
    const filasDias = []
    for (const s of semanas) {
      const d = leerNumero(dias[s.semana] ?? '')
      if (d != null && (Number.isNaN(d) || d < 0 || d > 7)) {
        toast.error(`Los días de la SEM ${s.numero} deben ir de 0 a 7`)
        return
      }
      // igual a lo de por defecto = sin fila
      filasDias.push({ semana: s.semana, dias: d == null || d === s.diasDefecto ? null : d })
    }
    setGuardando(true)
    try {
      await guardarMes(suc, mes, filas)
      await guardarDias(suc, mes, filasDias)
      toast.success(`Proyección de ${fmtMes(mes)} guardada`)
      setRecarga((x) => x + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SelectorMes />
        {editor && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copiarAnterior}>
              <Copy /> Copiar del mes anterior
            </Button>
            <Button size="sm" onClick={guardar} disabled={guardando}>
              <Save /> {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Venta proyectada de {fmtMes(mes)} · {suc}
            </CardTitle>
            <p className="text-xs text-muted-foreground">En pesos netos de venta. Deja en blanco las líneas sin proyección.</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Línea de negocio</TableHead>
                  <TableHead className="text-right">Monto proyectado</TableHead>
                  <TableHead>Nota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineas.map((l) => {
                  const v = montos[l.codigo] ?? { monto: '', nota: '' }
                  const fijar = (c: Partial<typeof v>) => setMontos((m) => ({ ...m, [l.codigo]: { ...v, ...c } }))
                  const leido = leerPesos(v.monto)
                  return (
                    <TableRow key={l.codigo}>
                      <TableCell className="font-semibold">
                        {l.nombre} <span className="text-xs font-normal text-muted-foreground">CECO {l.codigo}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          value={v.monto}
                          onChange={(e) => fijar({ monto: e.target.value })}
                          disabled={!editor}
                          inputMode="numeric"
                          placeholder="$"
                          className="ml-auto w-40 text-right"
                          aria-label={`Monto proyectado ${l.nombre}`}
                        />
                        {leido != null && !Number.isNaN(leido) && <span className="text-xs text-muted-foreground">{fmtPesos(leido)}</span>}
                      </TableCell>
                      <TableCell>
                        <Input value={v.nota} onChange={(e) => fijar({ nota: e.target.value })} disabled={!editor} placeholder="Opcional" className="min-w-[160px]" />
                      </TableCell>
                    </TableRow>
                  )
                })}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right font-mono-tabular">{fmtPesos(total)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Días hábiles</CardTitle>
            <p className="text-xs text-muted-foreground">
              Por defecto, lunes a viernes sin feriados fijos (no incluye los feriados que se trasladan ni elecciones: corrígelos aquí).
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Semana</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {semanas.map((s) => (
                  <TableRow key={s.semana}>
                    <TableCell>
                      <span className="font-semibold">SEM {s.numero}</span> <span className="text-xs text-muted-foreground">{fmtRango(s)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        value={dias[s.semana] ?? ''}
                        onChange={(e) => setDias((d) => ({ ...d, [s.semana]: e.target.value }))}
                        disabled={!editor}
                        inputMode="decimal"
                        placeholder={String(s.diasDefecto)}
                        className="ml-auto w-20 text-right"
                        aria-label={`Días hábiles SEM ${s.numero}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>Total del mes</TableCell>
                  <TableCell className="text-right font-mono-tabular">{fmtNum(diasMes, 1)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
