import { useMemo, useState } from 'react'
import { RotateCcw, Save, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { cn } from '@/lib/utils'
import { BarraCorte, etiquetaCorte, useCorte } from '../components/Filtros'
import { Aviso, Cargando } from '../components/Estados'
import { useBalance, useCatalogos, useIfrs } from '../hooks/useDatosFin'
import { usePermisosFin } from '../hooks/usePermisosFin'
import { guardarIfrs, type Cuenta } from '../lib/api'
import { SECCIONES_IFRS } from '../lib/balance'

// Clasificación de las cuentas de balance de SAP en los rubros IFRS. La sincronización propone un rubro
// para cada cuenta; quien tiene "Configurar" lo confirma o lo cambia, y desde ahí la sincronización ya
// no lo toca.

const NUM = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })
type Mostrar = 'con_saldo' | 'sin_revisar' | 'todas'

export default function ClasificacionIfrs() {
  const permisos = usePermisosFin()
  const { catalogos, estado, error: errorCat } = useCatalogos()
  const { actual } = useCorte()
  const { datos, error } = useBalance([actual])
  const { rubros, mapeo, loading, error: errorIfrs, recargar } = useIfrs()
  const [cambios, setCambios] = useState<Record<string, string | null>>({})
  const [buscar, setBuscar] = useState('')
  const [mostrar, setMostrar] = useState<Mostrar>('con_saldo')
  const [guardando, setGuardando] = useState(false)
  const editable = permisos.configurar

  const cuentas = useMemo(() => new Map((catalogos?.cuentas ?? []).map((c) => [c.codigo, c])), [catalogos])
  const saldo = useMemo(() => new Map((datos[0]?.filas ?? []).filter((f) => f.cuenta).map((f) => [f.cuenta as string, f.saldo])), [datos])
  const nombreRubro = useMemo(() => new Map(rubros.map((r) => [r.codigo, r.nombre])), [rubros])

  // rama del plan de SAP (nivel 4) para ubicar la cuenta
  const rama = (c: Cuenta | undefined) => {
    let x = c
    while (x && x.nivel > 4) x = x.padre ? cuentas.get(x.padre) : undefined
    return x && x !== c ? x.nombre : ''
  }

  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return mapeo
      .map((m) => ({ m, c: cuentas.get(m.cuenta), s: saldo.get(m.cuenta) ?? 0 }))
      .filter(({ m, c, s }) => {
        if (mostrar === 'con_saldo' && Math.round(s) === 0) return false
        if (mostrar === 'sin_revisar' && (m.revisado || Math.round(s) === 0)) return false
        if (q && !`${c?.codigo_formato} ${c?.nombre} ${nombreRubro.get(m.rubro ?? '') ?? ''}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => (a.c?.codigo_formato ?? a.m.cuenta).localeCompare(b.c?.codigo_formato ?? b.m.cuenta, 'es', { numeric: true }))
  }, [mapeo, cuentas, saldo, buscar, mostrar, nombreRubro])

  const nCambios = Object.keys(cambios).length

  async function guardar() {
    setGuardando(true)
    try {
      await guardarIfrs(Object.entries(cambios).map(([cuenta, rubro]) => ({ cuenta, rubro })))
      await recargar()
      setCambios({})
      toast.success('Clasificación guardada.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  const fallo = errorCat ?? error ?? errorIfrs
  if (fallo) return <Aviso error={fallo} />
  if (!catalogos || loading) return <Cargando />

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Rubro del estado de situación financiera IFRS (NIC 1) en que se presenta cada cuenta de balance de SAP. Las cuentas nuevas reciben una
        propuesta automática; {editable ? 'confírmala o cámbiala y guarda.' : 'la confirma o la cambia quien tenga permiso de configurar.'} Los
        saldos son al {etiquetaCorte(actual)}.
      </p>
      <BarraCorte estado={estado} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar cuenta o rubro" className="h-9 w-64 pl-8" />
        </div>
        <Select value={mostrar} onValueChange={(v) => setMostrar(v as Mostrar)}>
          <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="con_saldo">Cuentas con saldo</SelectItem>
            <SelectItem value="sin_revisar">Con saldo y sin revisar</SelectItem>
            <SelectItem value="todas">Todas las cuentas</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filas.length} cuentas</span>
        {editable && (
          <Button className="ml-auto" disabled={guardando || nCambios === 0} onClick={guardar}>
            <Save className="mr-1 h-4 w-4" /> {guardando ? 'Guardando…' : nCambios ? `Guardar ${nCambios} cambios` : 'Guardar'}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left font-semibold">Cuenta SAP</th>
              <th className="px-3 py-2 text-right font-semibold">Saldo</th>
              <th className="px-3 py-2 text-left font-semibold">Rubro IFRS</th>
              <th className="px-3 py-2 text-left font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ m, c, s }) => {
              const cambiado = m.cuenta in cambios
              const rubro = cambiado ? (cambios[m.cuenta] ?? m.rubro_propuesto) : m.rubro
              const revisado = cambiado ? cambios[m.cuenta] !== null : m.revisado
              const distinto = !!rubro && rubro !== m.rubro_propuesto
              const signo = c?.grupo === 1 ? 1 : -1
              return (
                <tr key={m.cuenta} className={cn('border-b last:border-0', cambiado && 'bg-brand/5')}>
                  <td className="px-3 py-1.5">
                    <span className="mr-1 text-[11px] text-muted-foreground">{c?.codigo_formato}</span>
                    {c?.nombre ?? m.cuenta}
                    <span className="block text-[11px] text-muted-foreground">{rama(c)}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{Math.round(s) ? NUM.format(signo * s) : '–'}</td>
                  <td className="px-3 py-1.5">
                    {editable ? (
                      <select
                        className="h-8 w-full max-w-[420px] rounded-md border border-input bg-background px-2 text-[13px]"
                        value={rubro ?? ''}
                        onChange={(e) => setCambios((x) => ({ ...x, [m.cuenta]: e.target.value || null }))}
                        aria-label={`Rubro de ${c?.nombre}`}
                      >
                        <option value="" disabled>(sin clasificar)</option>
                        {SECCIONES_IFRS.map((sec) => (
                          <optgroup key={sec.seccion} label={sec.nombre}>
                            {rubros.filter((r) => r.seccion === sec.seccion).map((r) => (
                              <option key={r.codigo} value={r.codigo}>{r.nombre}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    ) : (
                      (nombreRubro.get(rubro ?? '') ?? '(sin clasificar)')
                    )}
                    {distinto && (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">Propuesta: {nombreRubro.get(m.rubro_propuesto ?? '') ?? '(sin propuesta)'}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    {!rubro ? (
                      <Badge variant="destructive">Sin clasificar</Badge>
                    ) : revisado ? (
                      <Badge variant="outline">Revisada</Badge>
                    ) : (
                      <Badge variant="secondary">Propuesta automática</Badge>
                    )}
                    {editable && m.revisado && !cambiado && (
                      <button
                        className="ml-2 align-middle text-muted-foreground hover:text-foreground"
                        title="Volver a la propuesta automática"
                        onClick={() => setCambios((x) => ({ ...x, [m.cuenta]: null }))}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
