import { Fragment, useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Button } from '@/modules/financiero/components/ui/button'
import { Badge } from '@/modules/financiero/components/ui/badge'
import EmptyState from '@/modules/financiero/components/EmptyState'
import { formatCLP, formatFecha } from '@/modules/financiero/utils/formatters'
import { calcCR, normCod } from '../lib/calc'
import { useCatalogoGD } from '../hooks/useCatalogoGD'
import { useResponsables } from '../hooks/useResponsables'
import { useRegistroCompras, type RegistroCompra } from '../hooks/useRegistroCompras'

const fmtDec = (n: number | null, max = 4) => (n == null || Number.isNaN(n) ? '—' : n.toLocaleString('es-CL', { maximumFractionDigits: max }))

interface ProductoAgg {
  codigo: string
  descripcion: string | null
  unidades: Set<string>
  cantidadTotal: number
  guias: RegistroCompra[]
  enCatalogo: boolean
  unidad: string | null
  cantidadPorModulo: number | null
  ppp: number | null
  ok: boolean
  estado: string
  modulos: number | null
  valorizacion: number | null
}

interface GrupoAgg {
  key: string
  nombre: string
  responsables: Set<string>
  productos: Record<string, ProductoAgg>
}

export default function ReporteGrupo() {
  const { registros, loading, error } = useRegistroCompras()
  const { grupos, responsables, loading: loadingResp } = useResponsables()
  const { allProducts, pppMap, loading: loadingCatalogo } = useCatalogoGD()

  const [search, setSearch] = useState('')
  const [gdFiltro, setGdFiltro] = useState('')
  const [grupoFiltro, setGrupoFiltro] = useState<number | 'sin-grupo' | ''>('')
  const [respFiltro, setRespFiltro] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  const grupoPorResponsable = useMemo(() => {
    const map: Record<string, number | null> = {}
    for (const r of responsables) map[r.nombre] = r.grupo_id
    return map
  }, [responsables])

  const productoPorCodigo = useMemo(() => {
    const map: Record<string, (typeof allProducts)[number]> = {}
    for (const p of allProducts) map[normCod(p.codigo)] = p
    return map
  }, [allProducts])

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase()
    const gdQ = gdFiltro.trim().toLowerCase()
    return registros.filter((r) => {
      if (gdQ && !String(r.gd).toLowerCase().includes(gdQ)) return false
      if (desde && r.fecha_guia && r.fecha_guia < desde) return false
      if (hasta && r.fecha_guia && r.fecha_guia > hasta) return false
      if (respFiltro && (r.responsable ?? '') !== respFiltro) return false
      if (grupoFiltro !== '') {
        const rg = grupoPorResponsable[r.responsable ?? ''] ?? null
        if (grupoFiltro === 'sin-grupo') { if (rg) return false }
        else if (rg !== grupoFiltro) return false
      }
      if (q) {
        const hay = `${r.codigo} ${r.descripcion ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [registros, search, gdFiltro, respFiltro, grupoFiltro, grupoPorResponsable, desde, hasta])

  const modelo = useMemo(() => {
    const gruposMap: Record<string, GrupoAgg> = {}
    for (const r of filtrados) {
      const resp = r.responsable ?? ''
      const gid = grupoPorResponsable[resp] ?? null
      const key = gid != null ? String(gid) : 'sin-grupo'
      if (!gruposMap[key]) {
        const gObj = gid != null ? grupos.find((g) => g.id === gid) : null
        gruposMap[key] = { key, nombre: gObj ? gObj.nombre : 'Sin grupo', responsables: new Set(), productos: {} }
      }
      const G = gruposMap[key]
      if (resp) G.responsables.add(resp)
      const ck = normCod(r.codigo)
      if (!G.productos[ck]) {
        G.productos[ck] = {
          codigo: r.codigo, descripcion: r.descripcion, unidades: new Set(), cantidadTotal: 0, guias: [],
          enCatalogo: false, unidad: null, cantidadPorModulo: null, ppp: null, ok: false, estado: '', modulos: null, valorizacion: null,
        }
      }
      const P = G.productos[ck]
      P.cantidadTotal += calcCR(r)
      P.unidades.add(r.unidad || '')
      P.guias.push(r)
    }
    for (const G of Object.values(gruposMap)) {
      for (const P of Object.values(G.productos)) {
        const prod = productoPorCodigo[normCod(P.codigo)]
        P.enCatalogo = !!prod
        if (prod) P.descripcion = prod.descripcion
        P.unidad = P.unidades.size === 1 ? [...P.unidades][0] : null
        P.cantidadPorModulo = prod?.cantidad_por_modulo ?? null
        const st = pppMap[normCod(P.codigo)]
        P.ppp = st && st.cant > 0 ? st.monto / st.cant : null
        const flags: string[] = []
        if (!P.enCatalogo) flags.push('No encontrado en catálogo')
        if (P.unidades.size > 1) flags.push('Unidad no conciliada')
        if (P.enCatalogo && P.cantidadPorModulo == null) flags.push('Sin cantidad por módulo')
        if (P.enCatalogo && P.unidades.size <= 1 && P.ppp == null) flags.push('Sin PPP')
        P.ok = flags.length === 0
        P.estado = flags.length ? flags.join(' · ') : 'OK'
        P.modulos = P.enCatalogo && P.cantidadPorModulo && P.cantidadPorModulo > 0 && P.unidades.size === 1 ? P.cantidadTotal / P.cantidadPorModulo : null
        P.valorizacion = P.ok && P.ppp != null ? P.cantidadTotal * P.ppp : null
        P.guias.sort((a, b) => (b.fecha_guia || '').localeCompare(a.fecha_guia || ''))
      }
    }
    return gruposMap
  }, [filtrados, grupoPorResponsable, grupos, productoPorCodigo, pppMap])

  const keys = useMemo(() => {
    const ks = Object.keys(modelo).filter((k) => k !== 'sin-grupo').sort((a, b) => modelo[a].nombre.localeCompare(modelo[b].nombre))
    if (modelo['sin-grupo']) ks.push('sin-grupo')
    return ks
  }, [modelo])

  const kpis = useMemo(() => {
    let guias = new Set<string>(), prods = new Set<string>(), cant = 0, modulosT = 0, valor = 0, obs = 0
    const resps = new Set<string>()
    for (const key of keys) {
      const G = modelo[key]
      for (const r of G.responsables) resps.add(r)
      for (const P of Object.values(G.productos)) {
        prods.add(P.codigo)
        for (const r of P.guias) guias.add(r.gd)
        cant += P.cantidadTotal
        if (P.modulos != null) modulosT += P.modulos
        if (P.valorizacion != null) valor += P.valorizacion
        if (!P.ok) obs++
      }
    }
    return { grupos: keys.filter((k) => k !== 'sin-grupo').length, resps: resps.size, guias: guias.size, prods: prods.size, cant, modulosT, valor, obs }
  }, [keys, modelo])

  function toggle(key: string) {
    setAbiertos((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const cargando = loading || loadingResp || loadingCatalogo
  if (error) return <p className="text-destructive">{error}</p>

  const hayFiltros = !!search || !!gdFiltro || grupoFiltro !== '' || !!respFiltro || !!desde || !!hasta

  const celdas = [
    { label: 'Grupos', value: String(kpis.grupos) },
    { label: 'Responsables', value: String(kpis.resps) },
    { label: 'Guías', value: String(kpis.guias) },
    { label: 'Productos distintos', value: String(kpis.prods) },
    { label: 'Cantidad total', value: fmtDec(kpis.cant, 2) },
    { label: 'Módulos equivalentes', value: fmtDec(kpis.modulosT, 2) },
    { label: 'Valor total valorizable', value: formatCLP(kpis.valor), tono: 'text-success' },
    { label: 'Con observaciones', value: String(kpis.obs), tono: kpis.obs ? 'text-warning' : undefined },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-stretch rounded-md border bg-card text-sm">
        <div className="flex flex-1 flex-wrap divide-x">
          {celdas.map((c) => (
            <div key={c.label} className="min-w-[7.5rem] flex-1 px-3 py-2">
              <p className="text-[.65rem] font-semibold tracking-wide text-muted-foreground uppercase">{c.label}</p>
              <p className={cn('mt-0.5 text-lg font-bold tabular-nums', c.tono)}>{c.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="🔍  Código, descripción…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-56" />
        <Input placeholder="🔍  GD…" value={gdFiltro} onChange={(e) => setGdFiltro(e.target.value)} className="h-9 w-28" />
        <Select
          value={grupoFiltro === '' ? '__all' : String(grupoFiltro)}
          onValueChange={(v) => setGrupoFiltro(v === '__all' ? '' : v === 'sin-grupo' ? 'sin-grupo' : Number(v))}
        >
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Todos los grupos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos los grupos</SelectItem>
            {grupos.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.nombre}</SelectItem>)}
            <SelectItem value="sin-grupo">Sin grupo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={respFiltro || '__all'} onValueChange={(v) => setRespFiltro(v === '__all' ? '' : v)}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Todos los responsables" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos los responsables</SelectItem>
            {responsables.map((r) => <SelectItem key={r.id} value={r.nombre}>{r.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-36" title="Desde" />
        <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-36" title="Hasta" />
        {hayFiltros && (
          <Button variant="outline" size="sm" onClick={() => { setSearch(''); setGdFiltro(''); setGrupoFiltro(''); setRespFiltro(''); setDesde(''); setHasta('') }}>
            ✕ Limpiar
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{filtrados.length} de {registros.length} registros</span>
      </div>

      {!cargando && keys.length === 0 ? (
        <EmptyState icon={Users} title={registros.length ? 'Sin resultados — ajustá los filtros.' : 'Sin registros.'} />
      ) : (
        <div className="space-y-2">
          {keys.map((key) => {
            const G = modelo[key]
            const prods = Object.values(G.productos).sort((a, b) => (a.descripcion || '').localeCompare(b.descripcion || ''))
            let gGuias = 0, gModulos = 0, gValor = 0, gObs = 0
            const gGuiasSet = new Set<string>()
            for (const P of prods) {
              for (const r of P.guias) gGuiasSet.add(r.gd)
              if (P.modulos != null) gModulos += P.modulos
              if (P.valorizacion != null) gValor += P.valorizacion
              if (!P.ok) gObs++
            }
            gGuias = gGuiasSet.size
            const respList = [...G.responsables].sort().join(', ') || '—'
            return (
              <details key={key} className="rounded-md border" open>
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="font-semibold">{G.nombre}</span>
                  <span className="text-xs text-muted-foreground">{respList}</span>
                  <span className="ml-auto flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Guías: <b className="text-foreground">{gGuias}</b></span>
                    <span>Productos: <b className="text-foreground">{prods.length}</b></span>
                    <span>Módulos: <b className="text-foreground">{fmtDec(gModulos, 2)}</b></span>
                    <span>Valor: <b className="text-success">{formatCLP(gValor)}</b></span>
                    {gObs > 0 && <span className="text-warning">Obs: <b>{gObs}</b></span>}
                  </span>
                </summary>
                <div className="overflow-x-auto border-t">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
                        <th className="px-3 py-2">Producto</th>
                        <th className="px-3 py-2">Código</th>
                        <th className="px-3 py-2 text-right">Cant. Total</th>
                        <th className="px-3 py-2">Unidad</th>
                        <th className="px-3 py-2 text-right">Cant./Módulo</th>
                        <th className="px-3 py-2 text-right">Módulos Equiv.</th>
                        <th className="px-3 py-2 text-right">PPP</th>
                        <th className="px-3 py-2 text-right">Valorización</th>
                        <th className="px-3 py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prods.map((P) => {
                        const rowKey = `${key}:${P.codigo}`
                        const open = abiertos.has(rowKey)
                        return (
                          <Fragment key={rowKey}>
                            <tr className="cursor-pointer border-b last:border-0 hover:bg-muted/30" onClick={() => toggle(rowKey)}>
                              <td className="px-3 py-1.5">{open ? '▾' : '▸'} {P.descripcion || '—'}</td>
                              <td className="px-3 py-1.5 font-mono text-xs text-primary">{P.codigo}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{fmtDec(P.cantidadTotal, 2)}</td>
                              <td className="px-3 py-1.5">{P.unidad || 'MIXTA'}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{fmtDec(P.cantidadPorModulo)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{fmtDec(P.modulos, 4)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-success">{P.ppp != null ? formatCLP(P.ppp) : '—'}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-success">{P.valorizacion != null ? formatCLP(P.valorizacion) : '—'}</td>
                              <td className="px-3 py-1.5">
                                <Badge variant={P.ok ? 'success' : 'warning'}>{P.estado}</Badge>
                              </td>
                            </tr>
                            {open && (
                              <tr className="bg-muted/20">
                                <td colSpan={9} className="px-3 py-2">
                                  <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-left text-muted-foreground">
                                        <th className="px-2 py-1">N° Guía</th>
                                        <th className="px-2 py-1">Fecha</th>
                                        <th className="px-2 py-1">Responsable</th>
                                        <th className="px-2 py-1 text-right">Cantidad</th>
                                        <th className="px-2 py-1">Unidad</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {P.guias.map((r) => (
                                        <tr key={r.id} className="border-t">
                                          <td className="px-2 py-1">{r.gd}</td>
                                          <td className="px-2 py-1">{formatFecha(r.fecha_guia)}</td>
                                          <td className="px-2 py-1">{r.responsable || '—'}</td>
                                          <td className="px-2 py-1 text-right tabular-nums">{fmtDec(calcCR(r), 2)}</td>
                                          <td className="px-2 py-1">{r.unidad || '—'}</td>
                                        </tr>
                                      ))}
                                      <tr className="border-t font-semibold">
                                        <td className="px-2 py-1" colSpan={3}>Total</td>
                                        <td className="px-2 py-1 text-right tabular-nums">{fmtDec(P.cantidadTotal, 2)}</td>
                                        <td className="px-2 py-1">{P.unidad || 'MIXTA'}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            )
          })}
        </div>
      )}
    </div>
  )
}
