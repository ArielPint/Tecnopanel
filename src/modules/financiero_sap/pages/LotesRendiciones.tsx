import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Ban, ChevronDown, ChevronRight, Download, Info } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { formatFecha, formatFechaHora } from '@/modules/financiero/utils/formatters'
import { cn } from '@/lib/utils'
import { Aviso, Cargando } from '../components/Estados'
import { EstadoBadge } from '../components/rendiciones'
import { usePermisosFin } from '../hooks/usePermisosFin'
import { armarDtw, descargar } from '../lib/dtw'
import { pesos } from '../lib/formato'
import { RUTA } from '../lib/rutas'
import { anularLote, cargarAsientoFinal, cargarInformes, cargarLotes, type Informe, type Lote } from '../lib/rendiciones'

// Lotes de exportación: cada lote es un archivo de importación de asientos para SAP (DTW). Contabilidad lo descarga,
// lo importa en SAP y la sincronización marca cada rendición como "En SAP" cuando encuentra su asiento. Si la
// importación falla, se anula el lote y sus rendiciones vuelven a Aprobadas.

export default function LotesRendiciones() {
  const { rendiciones_aprobar } = usePermisosFin()
  const [params] = useSearchParams()
  const recien = Number(params.get('nuevo')) || null
  const [lotes, setLotes] = useState<Lote[] | null>(null)
  const [informes, setInformes] = useState<Informe[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [abierto, setAbierto] = useState<number | null>(recien)
  const [anulando, setAnulando] = useState<number | null>(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const recargar = useCallback(async () => {
    const [l, i] = await Promise.all([cargarLotes(), cargarInformes()])
    setLotes(l)
    setInformes(i)
  }, [])

  useEffect(() => {
    recargar().catch(setError)
  }, [recargar])

  const porLote = useMemo(() => {
    const m = new Map<number, Informe[]>()
    for (const i of informes) if (i.lote_id) m.set(i.lote_id, [...(m.get(i.lote_id) ?? []), i])
    return m
  }, [informes])

  async function bajar(lote: number, que: 'cabecera' | 'lineas') {
    try {
      const delLote = (porLote.get(lote) ?? []).slice().sort((a, b) => a.id - b.id)
      const lineas = await cargarAsientoFinal(delLote.map((i) => i.id))
      descargar(armarDtw(lote, delLote, lineas)[que])
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function anular(lote: number) {
    setOcupado(true)
    try {
      await anularLote(lote, motivo)
      await recargar()
      setAnulando(null)
      setMotivo('')
      toast.success(`Lote ${lote} anulado: sus rendiciones volvieron a Aprobadas.`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  if (error) return <Aviso error={error} />
  if (!lotes) return <Cargando />

  return (
    <div className="max-w-5xl space-y-4">
      <Link to={RUTA.rendiciones} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Rendiciones
      </Link>

      <div className="flex gap-3 rounded-md border bg-card p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-semibold">Cómo cargar un lote en SAP</p>
          <ol className="ml-4 list-decimal space-y-0.5 text-muted-foreground">
            <li>Descarga los dos archivos del lote: cabecera y líneas.</li>
            <li>
              En SAP Business One abre Data Transfer Workbench, crea una importación de <span className="font-medium text-foreground">Asientos</span>{' '}
              (oJournalEntries) y elige la cabecera para «JournalEntries» y las líneas para «JournalEntries_Lines».
            </li>
            <li>Simula primero; si no hay errores, importa.</li>
            <li>En la hora siguiente la sincronización encuentra los asientos (Ref2 = RG-…) y las rendiciones pasan a «En SAP».</li>
          </ol>
          <p className="text-muted-foreground">Si SAP rechaza el archivo, anula el lote: sus rendiciones vuelven a Aprobadas para corregirlas.</p>
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="w-8 px-3 py-2" />
                <th className="px-3 py-2 text-left font-semibold">Lote</th>
                <th className="px-3 py-2 text-left font-semibold">Generado</th>
                <th className="px-3 py-2 text-right font-semibold">Rendiciones</th>
                <th className="px-3 py-2 text-right font-semibold">Total</th>
                <th className="px-3 py-2 text-left font-semibold">Estado</th>
                <th className="px-3 py-2 text-right font-semibold">Archivos</th>
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => {
                const delLote = porLote.get(l.id) ?? []
                const enSap = delLote.filter((i) => i.estado === 'integrado').length
                const pendientes = delLote.filter((i) => i.estado === 'exportado').length
                const vivo = !l.anulado_en
                return (
                  <Fragment key={l.id}>
                    <tr className={cn('border-b', recien === l.id && 'bg-brand/5')}>
                      <td className="px-3 py-2">
                        <button aria-label="Ver rendiciones del lote" onClick={() => setAbierto(abierto === l.id ? null : l.id)} className="text-muted-foreground hover:text-foreground">
                          {abierto === l.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2 font-semibold tabular-nums">{l.id}</td>
                      <td className="px-3 py-2">
                        {formatFechaHora(l.creado_en)}
                        {l.creado_por_nombre && <span className="block text-xs text-muted-foreground">{l.creado_por_nombre}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.informes}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{pesos(l.total)}</td>
                      <td className="px-3 py-2">
                        {!vivo ? (
                          <span>
                            <Badge variant="secondary">Anulado</Badge>
                            <span className="block text-xs text-muted-foreground">{l.motivo_anulacion}</span>
                          </span>
                        ) : enSap === l.informes ? (
                          <Badge variant="success">En SAP</Badge>
                        ) : (
                          <span>
                            <Badge variant="warning">Por importar</Badge>
                            {enSap > 0 && <span className="block text-xs text-muted-foreground">{enSap} de {l.informes} ya en SAP</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {vivo && delLote.length > 0 && (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => bajar(l.id, 'cabecera')}>
                              <Download className="mr-1 h-3.5 w-3.5" /> Cabecera
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => bajar(l.id, 'lineas')}>
                              <Download className="mr-1 h-3.5 w-3.5" /> Líneas
                            </Button>
                            {rendiciones_aprobar && pendientes > 0 && (
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setAnulando(anulando === l.id ? null : l.id)}>
                                <Ban className="mr-1 h-3.5 w-3.5" /> Anular
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    {anulando === l.id && (
                      <tr className="border-b bg-destructive/5">
                        <td />
                        <td colSpan={6} className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se anula (p. ej. SAP rechazó la cuenta…)" className="h-9 min-w-0 flex-1" />
                            <Button size="sm" variant="destructive" disabled={ocupado || !motivo.trim()} onClick={() => anular(l.id)}>
                              Anular lote {l.id}
                            </Button>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {pendientes} {pendientes === 1 ? 'rendición vuelve' : 'rendiciones vuelven'} a Aprobadas. Las que ya están en SAP no cambian.
                          </p>
                        </td>
                      </tr>
                    )}
                    {abierto === l.id && (
                      <tr className="border-b bg-muted/30">
                        <td />
                        <td colSpan={6} className="px-3 py-2">
                          {delLote.length === 0 ? (
                            <p className="text-xs text-muted-foreground">El lote fue anulado: sus rendiciones volvieron a Aprobadas (ver su historial).</p>
                          ) : (
                            <table className="w-full text-sm">
                              <tbody>
                                {delLote.map((i) => (
                                  <tr key={i.id}>
                                    <td className="py-1 pr-3 tabular-nums">
                                      <Link to={RUTA.rendicion(i.id)} className="text-primary hover:underline">{i.folio ?? i.id}</Link>
                                    </td>
                                    <td className="py-1 pr-3">{i.empleado_nombre}</td>
                                    <td className="py-1 pr-3 tabular-nums">{formatFecha(i.fecha_asiento)}</td>
                                    <td className="py-1 pr-3"><EstadoBadge estado={i.estado} /></td>
                                    <td className="py-1 text-xs text-muted-foreground">
                                      {i.sap_numero && `Asiento SAP N° ${i.sap_numero}`}
                                      {i.rg_marca_error && <span className="block text-destructive">Rindegastos: {i.rg_marca_error}</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {lotes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    Aún no hay lotes. Se generan desde Rendiciones › Aprobadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
