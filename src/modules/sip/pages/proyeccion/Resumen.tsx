import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { cn } from '@/lib/utils'
import { Cargando, Tile, Vacio } from '../../components/comunes'
import { PctCumpl, SelectorMes, useMesProy } from '../../components/proyeccion'
import { fmtPesos } from '../../lib/cortes'
import { fmtNum } from '../../lib/formato'
import {
  armarResumen,
  fmtMes,
  fmtRango,
  listarAvance,
  listarDias,
  listarFacturado,
  listarLineasProy,
  listarManual,
  listarMes,
  proyeccionCierre,
  type AvanceProy,
  type DiasProy,
  type FacturadoProy,
  type LineaProy,
  type ManualProy,
  type MesProy,
} from '../../lib/proyeccion'
import { exportarResumenProyeccion } from '../../lib/exportProyeccion'
import { usePermisosSip } from '../../hooks/usePermisosSip'
import { useSucursalSip } from '../../hooks/useSucursalSip'

interface Datos {
  lineas: LineaProy[]
  avance: AvanceProy[]
  manual: ManualProy[]
  proyectado: MesProy[]
  dias: DiasProy[]
  facturado: FacturadoProy[]
}

const num = 'text-right font-mono-tabular whitespace-nowrap'
const fmtMed = (n: number) => fmtNum(n, 1)

/** Detalle de una línea: lo producido por proyecto y los montos manuales. */
function detalleLinea(linea: string, avance: AvanceProy[], manual: ManualProy[]) {
  const porProyecto = new Map<string, { nombre: string; porSemana: Map<string, number>; total: number }>()
  for (const a of avance.filter((x) => x.linea_codigo === linea)) {
    const k = a.proyecto_codigo || `OV ${a.doc_num}`
    let p = porProyecto.get(k)
    if (!p) porProyecto.set(k, (p = { nombre: a.proyecto_nombre || a.cliente || '', porSemana: new Map(), total: 0 }))
    p.porSemana.set(a.semana, (p.porSemana.get(a.semana) ?? 0) + a.valor)
    p.total += a.valor
  }
  for (const m of manual.filter((x) => x.linea_codigo === linea)) {
    const k = `Manual: ${m.glosa}`
    let p = porProyecto.get(k)
    if (!p) porProyecto.set(k, (p = { nombre: '', porSemana: new Map(), total: 0 }))
    p.porSemana.set(m.semana, (p.porSemana.get(m.semana) ?? 0) + m.monto)
    p.total += m.monto
  }
  return [...porProyecto.entries()].sort((a, b) => b[1].total - a[1].total)
}

export default function Resumen() {
  const { sucursal } = useSucursalSip()
  const { mes } = useMesProy()
  const { puedeEn } = usePermisosSip()
  const [datos, setDatos] = useState<Datos | null>(null)
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelado = false
    setDatos(null)
    Promise.all([listarLineasProy(), listarAvance(mes, sucursal), listarManual(mes, sucursal), listarMes(mes, sucursal), listarDias(mes, sucursal), listarFacturado(mes)])
      .then(([lineas, avance, manual, proyectado, dias, facturado]) => {
        if (cancelado) return
        // el facturado viene de las sucursales que ve el usuario: se filtra a la elegida
        const fact = sucursal === 'todas' ? facturado : facturado.filter((f) => f.sucursal === sucursal)
        setDatos({ lineas, avance, manual, proyectado, dias, facturado: fact })
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Error al cargar')
        if (!cancelado) setDatos({ lineas: [], avance: [], manual: [], proyectado: [], dias: [], facturado: [] })
      })
    return () => {
      cancelado = true
    }
  }, [mes, sucursal])

  const r = useMemo(() => (datos ? armarResumen({ mes, ...datos }) : null), [datos, mes])
  const nombre = useMemo(() => new Map((datos?.lineas ?? []).map((l) => [l.codigo, l.nombre])), [datos])

  if (!datos || !r) return <Cargando />

  const filasValor = r.valor.filter((v) => v.proyectado || v.total || v.facturado)
  const cierreTotal = proyeccionCierre(r.total.total, r)
  const sinFacturado = datos.facturado.length === 0

  const alternar = (k: string) =>
    setAbiertas((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SelectorMes />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {fmtNum(r.diasTranscurridos, 1)} de {fmtNum(r.diasMes, 1)} días hábiles · {sucursal === 'todas' ? 'todas las sucursales' : sucursal}
          </span>
          {puedeEn('proyeccion', 'exportar') && (
            <Button variant="outline" size="sm" onClick={() => exportarResumenProyeccion(mes, sucursal, r, nombre).catch((e) => toast.error(String(e)))}>
              <Download /> Excel
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile titulo="Proyectado" valor={fmtPesos(r.total.proyectado)} detalle={`venta de ${fmtMes(mes)}`} />
        <Tile titulo="Producido" valor={fmtPesos(r.total.total)} detalle="a precio de las OV" />
        <Tile
          titulo="Cumplimiento"
          valor={r.total.proyectado > 0 ? `${Math.round((r.total.total / r.total.proyectado) * 100)}%` : '—'}
          detalle="producido / proyectado"
        />
        <Tile
          titulo="Proyección al cierre"
          valor={cierreTotal == null ? '—' : fmtPesos(cierreTotal)}
          detalle={cierreTotal != null && r.total.proyectado > 0 ? `${Math.round((cierreTotal / r.total.proyectado) * 100)}% de lo proyectado` : 'al ritmo de los días transcurridos'}
        />
        <Tile titulo="Facturado SAP" valor={sinFacturado ? '—' : fmtPesos(r.total.facturado)} detalle={sinFacturado ? 'sin facturas en el mes' : 'libro de ventas del mes'} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Valor de venta por línea de negocio</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {filasValor.length === 0 ? (
            <Vacio>No hay proyección, producción ni facturación en {fmtMes(mes)}.</Vacio>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Línea</TableHead>
                  <TableHead className="text-right">Proyectado</TableHead>
                  {r.semanas.map((s) => (
                    <TableHead key={s.semana} className="border-l text-right" title={fmtRango(s)}>
                      SEM {s.numero}
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        {fmtRango(s)} · {fmtNum(s.dias, 1)} d
                      </span>
                    </TableHead>
                  ))}
                  <TableHead className="border-l text-right">Producido</TableHead>
                  <TableHead className="text-right">Por día</TableHead>
                  <TableHead className="text-right">Al cierre</TableHead>
                  <TableHead className="text-right">Real / proy.</TableHead>
                  <TableHead className="text-right">Cierre / proy.</TableHead>
                  <TableHead className="border-l text-right">Facturado SAP</TableHead>
                  <TableHead className="text-right">Fact. / proy.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filasValor.map((v) => {
                  const cierre = proyeccionCierre(v.total, r)
                  const abierta = abiertas.has(v.linea_codigo)
                  const detalle = abierta ? detalleLinea(v.linea_codigo, datos.avance, datos.manual) : []
                  return (
                    <Fragment key={v.linea_codigo}>
                      <TableRow className="cursor-pointer" onClick={() => alternar(v.linea_codigo)}>
                        <TableCell className="whitespace-nowrap font-semibold">
                          {abierta ? <ChevronDown className="mr-1 inline h-4 w-4" /> : <ChevronRight className="mr-1 inline h-4 w-4" />}
                          {nombre.get(v.linea_codigo) ?? v.linea_codigo}
                        </TableCell>
                        <TableCell className={num}>{v.proyectado ? fmtPesos(v.proyectado) : '—'}</TableCell>
                        {r.semanas.map((s) => (
                          <TableCell key={s.semana} className={cn(num, 'border-l')}>
                            {v.porSemana.get(s.semana) ? fmtPesos(v.porSemana.get(s.semana)!) : ''}
                          </TableCell>
                        ))}
                        <TableCell className={cn(num, 'border-l font-semibold')}>{fmtPesos(v.total)}</TableCell>
                        <TableCell className={num}>{r.diasTranscurridos > 0 ? fmtPesos(v.total / r.diasTranscurridos) : '—'}</TableCell>
                        <TableCell className={num}>{cierre == null ? '—' : fmtPesos(cierre)}</TableCell>
                        <TableCell className={num}>
                          <PctCumpl real={v.total} base={v.proyectado} />
                        </TableCell>
                        <TableCell className={num}>
                          <PctCumpl real={cierre ?? 0} base={v.proyectado} />
                        </TableCell>
                        <TableCell className={cn(num, 'border-l')}>{v.facturado ? fmtPesos(v.facturado) : '—'}</TableCell>
                        <TableCell className={num}>
                          <PctCumpl real={v.facturado} base={v.proyectado} />
                        </TableCell>
                      </TableRow>
                      {abierta &&
                        (detalle.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={r.semanas.length + 9} className="pl-9 text-xs text-muted-foreground">
                              Sin producción registrada en el mes.
                            </TableCell>
                          </TableRow>
                        ) : (
                          detalle.map(([k, p]) => (
                            <TableRow key={k} className="bg-muted/30 text-xs">
                              <TableCell className="max-w-[280px] truncate pl-9" title={`${k} ${p.nombre}`}>
                                <span className="font-mono-tabular">{k}</span> <span className="text-muted-foreground">{p.nombre}</span>
                              </TableCell>
                              <TableCell />
                              {r.semanas.map((s) => (
                                <TableCell key={s.semana} className={cn(num, 'border-l')}>
                                  {p.porSemana.get(s.semana) ? fmtPesos(p.porSemana.get(s.semana)!) : ''}
                                </TableCell>
                              ))}
                              <TableCell className={cn(num, 'border-l')}>{fmtPesos(p.total)}</TableCell>
                              <TableCell colSpan={6} />
                            </TableRow>
                          ))
                        ))}
                    </Fragment>
                  )
                })}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>Total</TableCell>
                  <TableCell className={num}>{fmtPesos(r.total.proyectado)}</TableCell>
                  {r.semanas.map((s) => (
                    <TableCell key={s.semana} className={cn(num, 'border-l')}>
                      {fmtPesos(r.total.porSemana.get(s.semana) ?? 0)}
                    </TableCell>
                  ))}
                  <TableCell className={cn(num, 'border-l')}>{fmtPesos(r.total.total)}</TableCell>
                  <TableCell className={num}>{r.diasTranscurridos > 0 ? fmtPesos(r.total.total / r.diasTranscurridos) : '—'}</TableCell>
                  <TableCell className={num}>{cierreTotal == null ? '—' : fmtPesos(cierreTotal)}</TableCell>
                  <TableCell className={num}>
                    <PctCumpl real={r.total.total} base={r.total.proyectado} />
                  </TableCell>
                  <TableCell className={num}>
                    <PctCumpl real={cierreTotal ?? 0} base={r.total.proyectado} />
                  </TableCell>
                  <TableCell className={cn(num, 'border-l')}>{sinFacturado ? '—' : fmtPesos(r.total.facturado)}</TableCell>
                  <TableCell className={num}>
                    <PctCumpl real={r.total.facturado} base={r.total.proyectado} />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Producido en unidades</CardTitle>
          <p className="text-xs text-muted-foreground">
            Cantidad × medida por unidad de cada línea de OV (ml de panel metálico, pulgadas de cercha, m² de panel…). Lo que no tiene
            medida cuenta en la unidad de la OV.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {r.unidades.length === 0 ? (
            <Vacio>Sin producción registrada en {fmtMes(mes)}.</Vacio>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Línea</TableHead>
                  <TableHead>Unidad</TableHead>
                  {r.semanas.map((s) => (
                    <TableHead key={s.semana} className="border-l text-right">
                      SEM {s.numero}
                    </TableHead>
                  ))}
                  <TableHead className="border-l text-right">Total</TableHead>
                  <TableHead className="text-right">Por día</TableHead>
                  <TableHead className="text-right">Al cierre</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.unidades.map((u) => {
                  const cierre = proyeccionCierre(u.total, r)
                  return (
                    <TableRow key={`${u.linea_codigo}|${u.unidad}`}>
                      <TableCell className="whitespace-nowrap font-semibold">{nombre.get(u.linea_codigo) ?? u.linea_codigo}</TableCell>
                      <TableCell>{u.unidad}</TableCell>
                      {r.semanas.map((s) => (
                        <TableCell key={s.semana} className={cn(num, 'border-l')}>
                          {u.porSemana.get(s.semana) ? fmtMed(u.porSemana.get(s.semana)!) : ''}
                        </TableCell>
                      ))}
                      <TableCell className={cn(num, 'border-l font-semibold')}>{fmtMed(u.total)}</TableCell>
                      <TableCell className={num}>{r.diasTranscurridos > 0 ? fmtMed(u.total / r.diasTranscurridos) : '—'}</TableCell>
                      <TableCell className={num}>{cierre == null ? '—' : fmtMed(cierre)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Producido = cantidad registrada × precio neto de la línea de OV de SAP, más los montos manuales. Al cierre = producido por día
        hábil transcurrido × días hábiles del mes. Facturado = libro de ventas de SAP del mes (facturas + anticipos − notas de crédito),
        por el centro de costo de cada línea.
      </p>
    </div>
  )
}
