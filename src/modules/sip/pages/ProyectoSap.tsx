import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Cargando, Tile, Vacio } from '../components/comunes'
import { listarItemsSap, listarLineasCorte, listarOvLineas, listarVentasSap, type ItemSap, type LineaCorteV, type OvLinea, type VentaSap } from '../lib/api'
import { avancePorProyecto, fmtPesos, nombreCorte } from '../lib/cortes'
import { fmtFecha, fmtFechaHora, fmtNum, fmtPct } from '../lib/formato'
import { RUTA } from '../lib/rutas'
import { usePermisosSip } from '../hooks/usePermisosSip'
import { BarraAvance } from './ProyectosSap'

/** Un proyecto de SAP: su estructura por modelo de vivienda y los cortes registrados. */
export default function ProyectoSap() {
  const { codigo = '' } = useParams<{ codigo: string }>()
  const navigate = useNavigate()
  const [items, setItems] = useState<ItemSap[] | null>(null)
  const [lineas, setLineas] = useState<LineaCorteV[]>([])
  const { puedeEn, loading: permisosLoading } = usePermisosSip()
  const verVentas = !permisosLoading && puedeEn('plan', 'ver')
  const [ov, setOv] = useState<{ lineas: OvLinea[]; venta: VentaSap | null } | null>(null)

  // La orden de venta de SAP solo para quien ve el plan (montos de venta)
  useEffect(() => {
    if (!verVentas) return
    Promise.all([listarOvLineas(codigo), listarVentasSap()])
      .then(([l, v]) => setOv({ lineas: l, venta: v.find((x) => x.proyecto_codigo === codigo) ?? null }))
      .catch((err) => toast.error(err instanceof Error ? err.message : 'No se pudo cargar la orden de venta'))
  }, [codigo, verVentas])

  useEffect(() => {
    Promise.all([listarItemsSap(codigo), listarLineasCorte({ proyecto: codigo })])
      .then(([i, l]) => {
        if (i.length === 0) throw new Error('El proyecto no existe o no tiene cortes en SAP')
        setItems(i)
        setLineas(l)
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'No se pudo cargar')
        navigate(RUTA.proyectosSap, { replace: true })
      })
  }, [codigo, navigate])

  const p = useMemo(() => (items ? avancePorProyecto(items)[0] : null), [items])
  const porModelo = useMemo(() => {
    const m = new Map<string, ItemSap[]>()
    for (const i of items ?? []) m.set(i.modelo_vivienda || 'Sin modelo', [...(m.get(i.modelo_vivienda || 'Sin modelo') ?? []), i])
    return [...m]
  }, [items])

  if (!items || !p) return <Cargando />
  const av = p.plan ? p.cortados / p.plan : 0

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <Link to={RUTA.proyectosSap} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Proyectos SAP
        </Link>
        <h1 className="mt-1 text-xl font-extrabold">
          {p.nombre} {!p.activo && <Badge variant="secondary">Cerrado en SAP</Badge>}
        </h1>
        <p className="text-sm text-muted-foreground">
          {p.codigo}
          {p.of_numero && ` · OF Cubicación ${p.of_numero}`}
          {p.cliente && ` · ${p.cliente}`}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile titulo="Paneles en SAP" valor={fmtNum(p.plan, 1)} detalle={`${fmtNum(p.m2Plan, 1)} m² de corte`} />
        <Tile titulo="Cortados" valor={fmtNum(p.cortados)} detalle={`Avance ${fmtPct(av)}`} />
        <Tile titulo="Rechazados" valor={fmtNum(p.rechazados)} detalle="Al cortar" />
        <Tile titulo="Maquila planificada" valor={fmtPesos(p.costoPlan)} detalle="m² × precio de SAP" />
      </div>

      {porModelo.map(([modelo, its]) => (
        <Card key={modelo}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {modelo} <span className="text-sm font-normal text-muted-foreground">· {fmtNum(its[0].viviendas)} vivienda(s)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo de panel</TableHead>
                  <TableHead>Panel</TableHead>
                  <TableHead>Corte</TableHead>
                  <TableHead className="text-right">Por viv.</TableHead>
                  <TableHead className="text-right">Total SAP</TableHead>
                  <TableHead className="text-right">Cortados</TableHead>
                  <TableHead className="text-right">Pendientes</TableHead>
                  <TableHead className="w-32">Avance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {its.map((i) => {
                  const a = i.paneles_plan ? i.cortados / i.paneles_plan : 0
                  return (
                    <TableRow key={i.id} className={i.vigente ? undefined : 'opacity-60'}>
                      <TableCell className="text-sm">
                        {i.tipo_panel || '—'}
                        {!i.vigente && <div className="text-xs text-muted-foreground">Ya no está en SAP</div>}
                      </TableCell>
                      <TableCell>
                        <div className="font-mono-tabular font-semibold">{i.panel_codigo}</div>
                        <div className="text-xs text-muted-foreground">{i.panel_descripcion}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {nombreCorte(i.corte_descripcion)}
                        {i.precio_m2 != null && <div className="text-xs text-muted-foreground">{fmtPesos(i.precio_m2)}/m²</div>}
                      </TableCell>
                      <TableCell className="text-right font-mono-tabular">{fmtNum(i.paneles_por_vivienda, 2)}</TableCell>
                      <TableCell className="text-right font-mono-tabular">{fmtNum(i.paneles_plan, 1)}</TableCell>
                      <TableCell className="text-right font-mono-tabular font-semibold">{fmtNum(i.cortados)}</TableCell>
                      <TableCell className="text-right font-mono-tabular">{fmtNum(Math.max(0, i.paneles_plan - i.cortados), 1)}</TableCell>
                      <TableCell>
                        <BarraAvance valor={a} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {verVentas && <OrdenVenta ov={ov} />}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cortes registrados</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {lineas.length === 0 ? (
            <Vacio>Aún no hay cortes registrados para este proyecto.</Vacio>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Panel</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Cortados</TableHead>
                  <TableHead className="text-right">Rech.</TableHead>
                  <TableHead className="hidden md:table-cell">OT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...lineas].reverse().map((l) => (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => navigate(RUTA.corte(l.parte_id))}>
                    <TableCell className="whitespace-nowrap">
                      {fmtFecha(l.fecha)} <span className="text-xs text-muted-foreground">N° {l.parte_numero} · {l.sucursal}</span>
                    </TableCell>
                    <TableCell className="font-mono-tabular font-semibold">{l.panel_codigo}</TableCell>
                    <TableCell className="text-sm">{[l.modelo_vivienda, l.tipo_panel].filter(Boolean).join(' · ')}</TableCell>
                    <TableCell className="text-right font-mono-tabular font-semibold">{fmtNum(l.cortados)}</TableCell>
                    <TableCell className="text-right font-mono-tabular">{l.rechazados ? fmtNum(l.rechazados) : '—'}</TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{l.referencia ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Órdenes de venta de SAP del proyecto: montos y líneas, como en SAP. Las de panel SIP valorizan el plan. */
function OrdenVenta({ ov }: { ov: { lineas: OvLinea[]; venta: VentaSap | null } | null }) {
  if (!ov) return <Cargando />
  const { lineas, venta } = ov
  return (
    <>
      {venta && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile titulo="Venta (OV SAP)" valor={fmtPesos(venta.monto)} detalle={`OV ${venta.ov_numeros} · neto`} />
          <Tile titulo="De eso, panel SIP" valor={fmtPesos(venta.monto_panel)} detalle="Kits de panel SIP, losa y PNL" />
          <Tile
            titulo="Valor por panel"
            valor={venta.valor_panel != null ? fmtPesos(venta.valor_panel) : '—'}
            detalle={venta.valor_panel != null ? `Panel SIP ÷ ${fmtNum(venta.paneles_estructura, 1)} paneles de la estructura` : 'Sin líneas de panel SIP o sin estructura'}
          />
          <Tile titulo="Por entregar" valor={fmtPesos(venta.monto_pendiente)} detalle="Cantidad pendiente × precio" />
        </div>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Orden de venta SAP</CardTitle>
          {venta && <p className="text-xs text-muted-foreground">Sincronizada {fmtFechaHora(venta.sincronizado_at)}. Montos netos en pesos.</p>}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {lineas.length === 0 ? (
            <Vacio>Este proyecto no tiene órdenes de venta en SAP (o aún no se sincronizan).</Vacio>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artículo</TableHead>
                  <TableHead className="hidden md:table-cell">Tipo vivienda</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Suministrada</TableHead>
                  <TableHead className="text-right">Pendiente</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineas.map((l) => (
                  <TableRow key={`${l.doc_entry}-${l.linea}`} className={l.total ? undefined : 'text-muted-foreground'}>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {l.descripcion}{' '}
                        {l.es_panel && l.total > 0 && (
                          <Badge variant="secondary" className="ml-1">
                            Panel SIP
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        OV {l.doc_num}
                        {l.estado === 'C' && ' (cerrada)'}
                        {l.tipo_estructura && ` · ${l.tipo_estructura}`}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{l.tipo_vivienda || '—'}</TableCell>
                    <TableCell className="text-right font-mono-tabular">
                      {fmtNum(l.cantidad, 2)} <span className="text-xs text-muted-foreground">{l.unidad}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono-tabular">{fmtNum(l.entregada, 2)}</TableCell>
                    <TableCell className="text-right font-mono-tabular">{l.pendiente ? fmtNum(l.pendiente, 2) : '—'}</TableCell>
                    <TableCell className="text-right font-mono-tabular">{l.precio ? fmtPesos(l.precio) : '—'}</TableCell>
                    <TableCell className="text-right font-mono-tabular font-semibold">{l.total ? fmtPesos(l.total) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
