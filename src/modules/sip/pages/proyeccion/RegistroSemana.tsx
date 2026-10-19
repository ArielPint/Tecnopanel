import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { cn } from '@/lib/utils'
import type { Sucursal } from '@/lib/lineasNegocio'
import { Cargando, Vacio, selectClase } from '../../components/comunes'
import { SelectorMes, fmtEntrada, leerNumero, leerPesos, useMesProy } from '../../components/proyeccion'
import { fmtPesos } from '../../lib/cortes'
import { fmtFechaHora, fmtNum, hoyChile } from '../../lib/formato'
import {
  LINEA_POR_AVANCE,
  fmtRango,
  guardarSemana,
  listarAvance,
  listarAvanceTotal,
  listarLineasProy,
  listarManual,
  listarOvProy,
  semanaDeFecha,
  semanasDelMes,
  type AvanceInput,
  type AvanceProy,
  type LineaProy,
  type ManualInput,
  type ManualProy,
  type OvProy,
} from '../../lib/proyeccion'
import { usePermisosSip } from '../../hooks/usePermisosSip'
import { useSucursalSip } from '../../hooks/useSucursalSip'

interface Datos {
  lineas: LineaProy[]
  ov: OvProy[]
  /** todo lo registrado en la sucursal (liviano): saldo y avance acumulado */
  historico: AvanceProy[]
  /** lo registrado en el mes, con nombres */
  delMes: AvanceProy[]
  manual: ManualProy[]
}

interface Entrada {
  cant: string
  /** % de avance acumulado (Tecno Home), 0 a 100 */
  pct: string
  /** medida por unidad escrita a mano */
  med: string
  uni: string
}

interface FilaManual {
  id: string
  linea_codigo: string
  glosa: string
  cant: string
  uni: string
  monto: string
}

const clave = (o: { doc_entry: number; linea: number }) => `${o.doc_entry}:${o.linea}`
const num = 'text-right font-mono-tabular whitespace-nowrap'
const vacia: Entrada = { cant: '', pct: '', med: '', uni: '' }

export default function RegistroSemana() {
  const { sucursal } = useSucursalSip()
  const { mes } = useMesProy()
  const { puedeEn, userId } = usePermisosSip()
  const editor = puedeEn('proyeccion', 'editar')
  const puedeRegistrar = editor || puedeEn('proyeccion', 'crear')

  const semanas = useMemo(() => semanasDelMes(mes), [mes])
  const [semana, setSemana] = useState(() => semanaDeFecha(semanasDelMes(mes), hoyChile()))
  useEffect(() => setSemana(semanaDeFecha(semanas, hoyChile())), [semanas])

  const [datos, setDatos] = useState<Datos | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [entradas, setEntradas] = useState<Record<string, Entrada>>({})
  const [manual, setManual] = useState<FilaManual[]>([])
  const [linea, setLinea] = useState('')
  const [texto, setTexto] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(true)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [editandoMedida, setEditandoMedida] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState(false)

  const suc: Sucursal | null = sucursal === 'todas' ? null : sucursal

  useEffect(() => {
    if (!suc) return
    let cancelado = false
    setDatos(null)
    Promise.all([listarLineasProy(), listarOvProy(suc), listarAvanceTotal(suc), listarAvance(mes, suc), listarManual(mes, suc)])
      .then(([lineas, ov, historico, delMes, man]) => !cancelado && setDatos({ lineas, ov, historico, delMes, manual: man }))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Error al cargar')
        if (!cancelado) setDatos({ lineas: [], ov: [], historico: [], delMes: [], manual: [] })
      })
    return () => {
      cancelado = true
    }
  }, [suc, mes, recarga])

  // lo guardado de la semana elegida
  const deLaSemana = useMemo(() => (datos?.delMes ?? []).filter((a) => a.semana === semana), [datos, semana])
  const manualSemana = useMemo(() => (datos?.manual ?? []).filter((m) => m.semana === semana), [datos, semana])
  const ajenos = useMemo(
    () => new Map(deLaSemana.filter((a) => !editor && a.created_by !== userId).map((a) => [clave(a), a])),
    [deLaSemana, editor, userId],
  )

  useEffect(() => {
    const e: Record<string, Entrada> = {}
    for (const a of deLaSemana) e[clave(a)] = { ...vacia, cant: fmtEntrada(a.cantidad), pct: a.avance_pct == null ? '' : fmtEntrada(a.avance_pct * 100, 2) }
    setEntradas(e)
    setManual(
      manualSemana
        .filter((m) => editor || m.created_by === userId)
        .map((m) => ({ id: m.id, linea_codigo: m.linea_codigo, glosa: m.glosa, cant: fmtEntrada(m.cantidad), uni: m.unidad ?? '', monto: String(Math.round(m.monto)) })),
    )
    setEditandoMedida(new Set())
  }, [deLaSemana, manualSemana, editor, userId])

  const nombreLinea = useMemo(() => new Map((datos?.lineas ?? []).map((l) => [l.codigo, l.nombre])), [datos])

  // registrado en otras semanas, y el % acumulado anterior a esta semana (Tecno Home)
  const previo = useMemo(() => {
    const m = new Map<string, { cantidad: number; pct: number }>()
    const orden = [...(datos?.historico ?? [])].sort((a, b) => a.semana.localeCompare(b.semana) || a.mes.localeCompare(b.mes))
    for (const a of orden) {
      if (a.mes === mes && a.semana === semana) continue
      const k = clave(a)
      const p = m.get(k) ?? { cantidad: 0, pct: 0 }
      p.cantidad += a.cantidad
      const antes = a.semana < semana || (a.semana === semana && a.mes < mes)
      if (antes && a.avance_pct != null) p.pct = a.avance_pct
      m.set(k, p)
    }
    return m
  }, [datos, mes, semana])

  /** Cantidad de la semana según lo escrito (Tecno Home: por el avance acumulado). */
  const cantidadDe = (o: OvProy, e: Entrada | undefined): number | null => {
    if (!e) return null
    if (o.linea_codigo === LINEA_POR_AVANCE) {
      const pct = leerNumero(e.pct)
      if (pct == null || Number.isNaN(pct)) return null
      return Math.max(0, (pct / 100 - (previo.get(clave(o))?.pct ?? 0)) * o.cantidad)
    }
    const c = leerNumero(e.cant)
    return c == null || Number.isNaN(c) ? null : c
  }
  const medidaDe = (o: OvProy, e: Entrada | undefined) => {
    const m = e?.med ? leerNumero(e.med) : null
    return { medida: m != null && !Number.isNaN(m) ? m : o.medida_efectiva, unidad: (e?.uni.trim() || o.unidad_efectiva) as string }
  }

  const grupos = useMemo(() => {
    if (!datos) return []
    const t = texto.trim().toLowerCase()
    const conEntrada = (o: OvProy) => !!entradas[clave(o)] && (entradas[clave(o)].cant !== '' || entradas[clave(o)].pct !== '')
    const filtradas = datos.ov.filter((o) => {
      if (linea && o.linea_codigo !== linea) return false
      if (t && !`${o.doc_num} ${o.proyecto_codigo} ${o.proyecto_nombre ?? ''} ${o.cliente ?? ''} ${o.descripcion} ${o.tipo_vivienda}`.toLowerCase().includes(t))
        return false
      if (soloPendientes && !conEntrada(o)) {
        const reg = previo.get(clave(o))?.cantidad ?? 0
        if (o.estado !== 'O' || o.cantidad - reg <= 0.0001) return false
      }
      return true
    })
    const porLinea = new Map<string, Map<string, OvProy[]>>()
    for (const o of filtradas) {
      let pl = porLinea.get(o.linea_codigo)
      if (!pl) porLinea.set(o.linea_codigo, (pl = new Map()))
      const kp = o.proyecto_codigo || `OV ${o.doc_num}`
      const lista = pl.get(kp) ?? []
      lista.push(o)
      pl.set(kp, lista)
    }
    const orden = new Map(datos.lineas.map((l, i) => [l.codigo, i]))
    return [...porLinea.entries()]
      .sort((a, b) => (orden.get(a[0]) ?? 99) - (orden.get(b[0]) ?? 99))
      .map(([codigo, proyectos]) => ({ codigo, proyectos: [...proyectos.entries()].map(([k, ov]) => ({ clave: `${codigo}|${k}`, codigo: k, ov })) }))
  }, [datos, linea, texto, soloPendientes, entradas, previo])

  const totalSemana = useMemo(() => {
    if (!datos) return 0
    let total = 0
    for (const o of datos.ov) {
      const c = cantidadDe(o, entradas[clave(o)])
      if (c) total += c * o.precio
    }
    for (const m of manual) total += leerPesos(m.monto) || 0
    for (const m of manualSemana) if (!editor && m.created_by !== userId) total += m.monto
    return total
  }, [datos, entradas, manual, manualSemana, previo])

  if (!suc) {
    return <Vacio>Elige una sucursal arriba (Santiago o Puerto Varas) para registrar lo producido.</Vacio>
  }
  if (!datos) return <Cargando />

  const fijar = (k: string, cambio: Partial<Entrada>) => setEntradas((e) => ({ ...e, [k]: { ...(e[k] ?? vacia), ...cambio } }))
  const alternar = (set: React.Dispatch<React.SetStateAction<Set<string>>>, k: string) =>
    set((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const guardar = async () => {
    const avance: AvanceInput[] = []
    for (const o of datos.ov) {
      const k = clave(o)
      if (ajenos.has(k)) continue
      const e = entradas[k]
      if (!e) continue
      const esHome = o.linea_codigo === LINEA_POR_AVANCE
      const pct = esHome ? leerNumero(e.pct) : null
      if (esHome && pct != null && (Number.isNaN(pct) || pct < 0 || pct > 100)) {
        toast.error(`El avance de "${o.descripcion}" debe ir de 0 a 100%`)
        return
      }
      const c = cantidadDe(o, e)
      if (!esHome && e.cant !== '' && (c == null || Number.isNaN(c) || c < 0)) {
        toast.error(`La cantidad de "${o.descripcion}" no es válida`)
        return
      }
      const med = e.med ? leerNumero(e.med) : null
      if (med != null && (Number.isNaN(med) || med < 0)) {
        toast.error(`La medida de "${o.descripcion}" no es válida`)
        return
      }
      if ((c ?? 0) <= 0 && pct == null) continue
      avance.push({
        doc_entry: o.doc_entry,
        linea: o.linea,
        cantidad: Math.round((c ?? 0) * 10000) / 10000,
        avance_pct: pct == null ? null : pct / 100,
        medida: med,
        unidad: med != null ? e.uni.trim() || o.unidad_efectiva : null,
      })
    }
    const man: ManualInput[] = []
    for (const m of manual) {
      if (!m.glosa.trim() && !m.monto.trim()) continue
      const monto = leerPesos(m.monto)
      const cant = leerNumero(m.cant)
      if (!m.linea_codigo || !m.glosa.trim() || monto == null || Number.isNaN(monto) || monto < 0) {
        toast.error('Cada monto manual necesita línea, glosa y monto')
        return
      }
      if (cant != null && (Number.isNaN(cant) || cant < 0 || !m.uni.trim())) {
        toast.error(`"${m.glosa}": la cantidad necesita su unidad`)
        return
      }
      man.push({ linea_codigo: m.linea_codigo, glosa: m.glosa.trim(), cantidad: cant, unidad: cant != null ? m.uni.trim() : null, monto })
    }
    setGuardando(true)
    try {
      const r = await guardarSemana(suc, mes, semana, avance, man)
      toast.success(`Semana guardada: ${r.avance} ${r.avance === 1 ? 'línea' : 'líneas'} de OV y ${r.manual} ${r.manual === 1 ? 'monto manual' : 'montos manuales'}`)
      setRecarga((x) => x + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  const sem = semanas.find((s) => s.semana === semana)
  const sincronizado = datos.ov.reduce((m, o) => (o.sincronizado_at > m ? o.sincronizado_at : m), '')

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SelectorMes />
        {sincronizado && <span className="text-xs text-muted-foreground">OV de SAP al {fmtFechaHora(sincronizado)}</span>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {semanas.map((s) => (
          <button
            key={s.semana}
            onClick={() => setSemana(s.semana)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-left text-xs transition-colors',
              s.semana === semana ? 'border-brand bg-brand/10 text-brand' : 'hover:bg-accent',
            )}
          >
            <span className="block font-bold">SEM {s.numero}</span>
            <span className="text-muted-foreground">{fmtRango(s)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={linea} onChange={(e) => setLinea(e.target.value)} className={cn(selectClase, 'w-auto')} aria-label="Línea de negocio">
          <option value="">Todas las líneas</option>
          {datos.lineas.map((l) => (
            <option key={l.codigo} value={l.codigo}>
              {l.nombre}
            </option>
          ))}
        </select>
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar OV, proyecto, cliente o descripción" className="w-full sm:w-80" />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
          Solo OV abiertas con saldo
        </label>
      </div>

      {grupos.length === 0 ? (
        <Vacio>No hay líneas de OV de SAP con esos filtros en {suc}.</Vacio>
      ) : (
        grupos.map((g) => {
          const esHome = g.codigo === LINEA_POR_AVANCE
          return (
            <Card key={g.codigo}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{nombreLinea.get(g.codigo) ?? g.codigo}</CardTitle>
                {esHome && <p className="text-xs text-muted-foreground">Tecno Home se registra por % de avance acumulado de cada línea.</p>}
              </CardHeader>
              <CardContent className="space-y-1 p-0 pb-2">
                {g.proyectos.map((p) => {
                  const enSemana = p.ov.reduce((t, o) => t + (cantidadDe(o, entradas[clave(o)]) ?? 0) * o.precio, 0)
                  const abierto = abiertos.has(p.clave) || !!texto.trim()
                  const primera = p.ov[0]
                  return (
                    <div key={p.clave} className="border-t">
                      <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-accent" onClick={() => alternar(setAbiertos, p.clave)}>
                        {abierto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                        <span className="font-mono-tabular font-semibold">{p.codigo}</span>
                        <span className="truncate text-muted-foreground">{primera.proyecto_nombre || primera.cliente}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{p.ov.length} líneas</span>
                        {enSemana > 0 && <Badge variant="secondary">{fmtPesos(enSemana)}</Badge>}
                      </button>
                      {abierto && (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>OV</TableHead>
                                <TableHead>Descripción</TableHead>
                                <TableHead className="text-right">Cant. OV</TableHead>
                                <TableHead className="text-right">{esHome ? 'Avance previo' : 'Registrado'}</TableHead>
                                <TableHead className="text-right">Precio</TableHead>
                                <TableHead className="text-right">Medida / u</TableHead>
                                <TableHead className="text-right">{esHome ? '% acumulado' : 'Esta semana'}</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {p.ov.map((o) => {
                                const k = clave(o)
                                const e = entradas[k]
                                const ajeno = ajenos.get(k)
                                const c = cantidadDe(o, e) ?? 0
                                const reg = previo.get(k)?.cantidad ?? 0
                                const saldo = o.cantidad - reg - c
                                const { medida, unidad } = medidaDe(o, e)
                                const editMed = editandoMedida.has(k)
                                const bloqueado = !puedeRegistrar || !!ajeno
                                return (
                                  <TableRow key={k}>
                                    <TableCell className="whitespace-nowrap font-mono-tabular text-xs">
                                      {o.doc_num}
                                      {o.estado === 'C' && (
                                        <Badge variant="outline" className="ml-1">
                                          cerrada
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="min-w-[220px] text-sm">
                                      {o.descripcion}
                                      {(o.tipo_vivienda || o.tipo_estructura) && (
                                        <span className="block text-xs text-muted-foreground">{[o.tipo_vivienda, o.tipo_estructura].filter(Boolean).join(' · ')}</span>
                                      )}
                                      {ajeno && <span className="block text-xs text-amber-600">Lo registró {ajeno.actualizado_por ?? 'otra persona'}</span>}
                                    </TableCell>
                                    <TableCell className={num}>
                                      {fmtNum(o.cantidad, 2)} <span className="text-xs text-muted-foreground">{o.unidad?.toLowerCase()}</span>
                                    </TableCell>
                                    <TableCell className={num}>
                                      {esHome ? `${fmtNum((previo.get(k)?.pct ?? 0) * 100, 1)}%` : fmtNum(reg, 2)}
                                      {!esHome && saldo < -0.0001 && <span className="block text-xs text-destructive">sobre la OV</span>}
                                    </TableCell>
                                    <TableCell className={num}>{fmtPesos(o.precio)}</TableCell>
                                    <TableCell className={num}>
                                      {editMed ? (
                                        <span className="inline-flex gap-1">
                                          <Input
                                            value={e?.med ?? ''}
                                            onChange={(ev) => fijar(k, { med: ev.target.value })}
                                            placeholder={fmtEntrada(o.medida_efectiva) || 'medida'}
                                            className="h-8 w-20 text-right"
                                            aria-label="Medida por unidad"
                                          />
                                          <Input
                                            value={e?.uni ?? ''}
                                            onChange={(ev) => fijar(k, { uni: ev.target.value })}
                                            placeholder={o.unidad_efectiva}
                                            className="h-8 w-14"
                                            aria-label="Unidad"
                                          />
                                        </span>
                                      ) : (
                                        <span title={o.medida_manual != null ? 'Escrita a mano' : o.medida_origen === 'kit' ? 'Suma de los componentes del kit' : o.medida_origen ? 'De la estructura de proyecto' : 'Sin medida: cuenta la cantidad de la OV'}>
                                          {medida != null ? `${fmtNum(medida, 2)} ${unidad}` : <span className="text-muted-foreground">—</span>}
                                        </span>
                                      )}
                                      {!bloqueado && (
                                        <button className="ml-1 text-muted-foreground hover:text-foreground" onClick={() => alternar(setEditandoMedida, k)} aria-label="Cambiar medida">
                                          <Pencil className="inline h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Input
                                        value={esHome ? (e?.pct ?? '') : (e?.cant ?? '')}
                                        onChange={(ev) => fijar(k, esHome ? { pct: ev.target.value } : { cant: ev.target.value })}
                                        disabled={bloqueado}
                                        inputMode="decimal"
                                        placeholder={esHome ? '%' : '0'}
                                        className="ml-auto h-8 w-24 text-right"
                                        aria-label={esHome ? 'Avance acumulado (%)' : 'Cantidad producida esta semana'}
                                      />
                                    </TableCell>
                                    <TableCell className={num}>
                                      {c > 0 ? fmtPesos(c * o.precio) : ''}
                                      {c > 0 && medida != null && (
                                        <span className="block text-xs text-muted-foreground">
                                          {fmtNum(c * medida, 1)} {unidad}
                                        </span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )
        })
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Montos manuales</CardTitle>
          <p className="text-xs text-muted-foreground">Lo producido que no está en una OV de SAP. La cantidad y su unidad son opcionales.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {manualSemana
            .filter((m) => !editor && m.created_by !== userId)
            .map((m) => (
              <p key={m.id} className="text-sm text-muted-foreground">
                {nombreLinea.get(m.linea_codigo)} · {m.glosa} · {fmtPesos(m.monto)} <span className="text-xs">(lo registró {m.actualizado_por ?? 'otra persona'})</span>
              </p>
            ))}
          {manual.map((m, i) => {
            const cambiar = (c: Partial<FilaManual>) => setManual((lista) => lista.map((x, j) => (j === i ? { ...x, ...c } : x)))
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-2">
                <select
                  value={m.linea_codigo}
                  onChange={(e) => cambiar({ linea_codigo: e.target.value })}
                  className={cn(selectClase, 'w-44')}
                  aria-label="Línea de negocio"
                  disabled={!puedeRegistrar}
                >
                  <option value="">Línea…</option>
                  {datos.lineas.map((l) => (
                    <option key={l.codigo} value={l.codigo}>
                      {l.nombre}
                    </option>
                  ))}
                </select>
                <Input value={m.glosa} onChange={(e) => cambiar({ glosa: e.target.value })} placeholder="Glosa (qué se produjo)" className="min-w-[200px] flex-1" disabled={!puedeRegistrar} />
                <Input value={m.cant} onChange={(e) => cambiar({ cant: e.target.value })} placeholder="Cant." inputMode="decimal" className="w-20 text-right" disabled={!puedeRegistrar} />
                <Input value={m.uni} onChange={(e) => cambiar({ uni: e.target.value })} placeholder="Unidad" className="w-20" disabled={!puedeRegistrar} />
                <Input value={m.monto} onChange={(e) => cambiar({ monto: e.target.value })} placeholder="Monto $" inputMode="numeric" className="w-32 text-right" disabled={!puedeRegistrar} />
                {puedeRegistrar && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setManual((lista) => lista.filter((_, j) => j !== i))} aria-label="Quitar">
                    <Trash2 />
                  </Button>
                )}
              </div>
            )
          })}
          {puedeRegistrar && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setManual((l) => [...l, { id: crypto.randomUUID(), linea_codigo: linea, glosa: '', cant: '', uni: '', monto: '' }])}
            >
              <Plus /> Agregar monto manual
            </Button>
          )}
        </CardContent>
      </Card>

      {puedeRegistrar && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur md:left-64">
          <div className="mx-auto flex max-w-6xl items-center justify-end gap-3">
            <span className="text-sm text-muted-foreground">
              SEM {sem?.numero} ({sem && fmtRango(sem)}) · {suc}:
            </span>
            <span className="font-mono-tabular text-lg font-bold">{fmtPesos(totalSemana)}</span>
            <Button onClick={guardar} disabled={guardando}>
              <Save /> {guardando ? 'Guardando…' : 'Guardar semana'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
