import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/modules/financiero/components/ui/dialog'
import { useObraCrData } from '../hooks/useObraCrData'
import { useObraCrExcel } from '../hooks/useObraCrExcel'
import { useObraCrConfigBatchSave } from '../hooks/useObraCrConfigSave'
import { isModuloTerminado, buildEntregasFlat, type ModuloCombinado, type Asignaciones } from '../lib/matrix'
import { ASIGNACION_ORDER, ASIGNACION_DEFS, SUBCONTRATO_LABEL, type AsignacionCategoria, type ObraSubcontrato } from '../lib/categorias'
import type { ObraCrConfigCambio } from '../lib/supaData'
import CalendarioEntregas from '../components/CalendarioEntregas'

function UploadCard() {
  const { uploading, error, lastResult, handleFile } = useObraCrExcel()
  return (
    <Card>
      <CardHeader>
        <CardTitle>📋 Archivo CR (avance en obra)</CardTitle>
        <CardDescription>Sube el Excel con la hoja "CR" — alimenta el checklist por partida de las vistas Por Contratista y Vista General</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-xs text-destructive">{error}</p>}
        {lastResult && !error && <p className="text-xs text-success">{lastResult.nuevos} módulo(s) nuevo(s), {lastResult.actualizados} actualizado(s).</p>}
        <Button asChild disabled={uploading}>
          <label className="cursor-pointer">
            {uploading ? 'Procesando…' : 'Subir archivo CR'}
            <input type="file" accept=".xlsm,.xlsx" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </label>
        </Button>
      </CardContent>
    </Card>
  )
}

function claveCambio(moduloNum: number, categoria: AsignacionCategoria): string {
  return `${moduloNum}:${categoria}`
}

interface DialogoState {
  moduloNum: number | null
  categoria: AsignacionCategoria | null
  nuevo: boolean
  fechaInicial?: string
}

function AsignacionDialog({
  dialogo,
  modulos,
  onClose,
  onConfirmar,
  onQuitar,
}: {
  dialogo: DialogoState
  modulos: ModuloCombinado[]
  onClose: () => void
  onConfirmar: (cambio: ObraCrConfigCambio) => void
  onQuitar: (moduloNum: number, categoria: AsignacionCategoria) => void
}) {
  const [moduloNum, setModuloNum] = useState<number | null>(dialogo.moduloNum)
  const modulo = modulos.find((m) => m.moduloNum === moduloNum) ?? null
  const categoriasDisponibles = modulo
    ? ASIGNACION_ORDER.filter((cat) => dialogo.categoria === cat || !modulo.asignaciones[cat].fechaEntrega)
    : ASIGNACION_ORDER
  const [categoria, setCategoria] = useState<AsignacionCategoria | null>(dialogo.categoria ?? categoriasDisponibles[0] ?? null)
  const asignacionActual = modulo && categoria ? modulo.asignaciones[categoria] : null
  const [subcontrato, setSubcontrato] = useState<ObraSubcontrato | null>(asignacionActual?.subcontrato ?? null)
  const [fecha, setFecha] = useState<string>(asignacionActual?.fechaEntrega ?? dialogo.fechaInicial ?? '')

  const def = categoria ? ASIGNACION_DEFS[categoria] : null
  const subcontratoFinal = def?.subcontratoFijo ?? subcontrato

  function confirmar() {
    if (!moduloNum || !categoria || !fecha) return
    onConfirmar({ moduloNum, categoria, subcontrato: subcontratoFinal, fechaEntrega: fecha })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{dialogo.nuevo ? 'Nueva asignación' : 'Editar asignación'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {dialogo.nuevo && !dialogo.moduloNum ? (
            <div className="space-y-1">
              <label className="text-xs font-medium">Módulo</label>
              <Select value={moduloNum ? String(moduloNum) : ''} onValueChange={(v) => setModuloNum(Number(v))}>
                <SelectTrigger className="h-8 w-full"><SelectValue placeholder="Elegir módulo" /></SelectTrigger>
                <SelectContent>
                  {modulos
                    .filter((m) => ASIGNACION_ORDER.some((cat) => !m.asignaciones[cat].fechaEntrega))
                    .map((m) => <SelectItem key={m.moduloNum} value={String(m.moduloNum)}>{m.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-sm font-medium">Módulo {modulo?.code ?? moduloNum}</p>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium">Categoría</label>
            <Select value={categoria ?? ''} onValueChange={(v) => setCategoria(v as AsignacionCategoria)} disabled={!dialogo.nuevo}>
              <SelectTrigger className="h-8 w-full"><SelectValue placeholder="Elegir categoría" /></SelectTrigger>
              <SelectContent>
                {(dialogo.nuevo ? categoriasDisponibles : ASIGNACION_ORDER).map((cat) => (
                  <SelectItem key={cat} value={cat}>{ASIGNACION_DEFS[cat].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {def &&
            (def.subcontratoFijo ? (
              <p className="text-xs text-muted-foreground">
                Subcontrato: <span className="font-medium text-foreground">{SUBCONTRATO_LABEL[def.subcontratoFijo]}</span>
              </p>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-medium">Subcontrato</label>
                <Select value={subcontrato ?? ''} onValueChange={(v) => setSubcontrato(v as ObraSubcontrato)}>
                  <SelectTrigger className="h-8 w-full"><SelectValue placeholder="We Do o Conbes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="W">We Do</SelectItem>
                    <SelectItem value="C">Conbes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}

          <div className="space-y-1">
            <label className="text-xs font-medium">Fecha de entrega</label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-8" />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {!dialogo.nuevo && moduloNum && categoria && (
            <Button variant="outline" onClick={() => onQuitar(moduloNum, categoria)}>Quitar</Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={confirmar} disabled={!moduloNum || !categoria || !fecha || (!def?.subcontratoFijo && !subcontrato)}>Aplicar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AsignacionesCard() {
  const { modulos: todos, loading } = useObraCrData()
  const { guardarTodo, guardando } = useObraCrConfigBatchSave()
  const [cambios, setCambios] = useState<Map<string, ObraCrConfigCambio>>(new Map())
  const [filtro, setFiltro] = useState('')
  const [dialogo, setDialogo] = useState<DialogoState | null>(null)

  const pendientes = useMemo(() => todos.filter((m) => !isModuloTerminado(m)), [todos])

  const modulosCombinados = useMemo(
    () =>
      pendientes.map((m) => {
        const asignaciones = { ...m.asignaciones } as Asignaciones
        for (const cat of ASIGNACION_ORDER) {
          const c = cambios.get(claveCambio(m.moduloNum, cat))
          if (c) asignaciones[cat] = { subcontrato: c.subcontrato, fechaEntrega: c.fechaEntrega }
        }
        return { ...m, asignaciones }
      }),
    [pendientes, cambios],
  )

  const entregas = useMemo(() => buildEntregasFlat(modulosCombinados), [modulosCombinados])

  const pendientesSinProgramar = useMemo(() => {
    const q = filtro.trim()
    return modulosCombinados.filter((m) => {
      if (q && !String(m.moduloNum).includes(q)) return false
      return ASIGNACION_ORDER.some((cat) => !m.asignaciones[cat].fechaEntrega)
    })
  }, [modulosCombinados, filtro])

  function confirmarCambio(cambio: ObraCrConfigCambio) {
    setCambios((prev) => {
      const next = new Map(prev).set(claveCambio(cambio.moduloNum, cambio.categoria), cambio)
      // Ventanas no tiene programación especial — sigue siempre la fecha de Terminaciones, asignada a Ingelagos.
      if (cambio.categoria === 'terminaciones') {
        const ventanas: ObraCrConfigCambio = {
          moduloNum: cambio.moduloNum,
          categoria: 'ventanas',
          subcontrato: cambio.fechaEntrega ? 'INGELAGOS' : null,
          fechaEntrega: cambio.fechaEntrega,
        }
        next.set(claveCambio(ventanas.moduloNum, ventanas.categoria), ventanas)
      }
      return next
    })
    setDialogo(null)
  }

  function quitarCambio(moduloNum: number, categoria: AsignacionCategoria) {
    confirmarCambio({ moduloNum, categoria, subcontrato: null, fechaEntrega: null })
  }

  async function guardarCambios() {
    await guardarTodo([...cambios.values()])
    setCambios(new Map())
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>🏗️ Asignación de subcontrato y fecha de entrega</CardTitle>
            <CardDescription>Por módulo pendiente de término — hasta 4 asignaciones (Terminaciones, Eléctrico, Sanitario, Ventanas), cada una con su propio subcontrato y fecha. Arrastrá un módulo a otro día para reprogramarlo.</CardDescription>
          </div>
          <Button onClick={guardarCambios} disabled={!cambios.size || guardando}>
            {guardando ? 'Guardando…' : `Guardar cambios${cambios.size ? ` (${cambios.size})` : ''}`}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : !todos.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin módulos — subí primero el archivo CR.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Pendientes sin programar</p>
              <Input placeholder="Buscar módulo (ej: 093)" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-8 text-xs" />
              <div className="max-h-[60vh] space-y-1 overflow-auto">
                {pendientesSinProgramar.map((m) => {
                  const faltantes = ASIGNACION_ORDER.filter((cat) => !m.asignaciones[cat].fechaEntrega)
                  return (
                    <button
                      key={m.moduloNum}
                      onClick={() => setDialogo({ moduloNum: m.moduloNum, categoria: null, nuevo: true })}
                      className="flex w-full items-center justify-between gap-1 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-accent/40"
                    >
                      <span className="flex items-center gap-1 font-medium">
                        {m.code}
                        <Badge variant={m.tipo === 'HUMEDO' ? 'default' : 'secondary'} className="px-1 py-0 text-[.55rem]">
                          {m.tipo === 'HUMEDO' ? 'Húmedo' : 'Seco'}
                        </Badge>
                      </span>
                      <span className="flex flex-wrap justify-end gap-0.5">
                        {faltantes.map((cat) => (
                          <Badge key={cat} variant="outline" className="px-1 py-0 text-[.55rem]">{ASIGNACION_DEFS[cat].label.slice(0, 4)}</Badge>
                        ))}
                      </span>
                    </button>
                  )
                })}
                {!pendientesSinProgramar.length && <p className="py-4 text-center text-xs text-muted-foreground">Todo programado.</p>}
              </div>
            </div>

            <CalendarioEntregas
              ventana={{ atras: 1, adelante: 4 }}
              entregas={entregas}
              onEntregaClick={(item) => setDialogo({ moduloNum: item.moduloNum, categoria: item.categoria, nuevo: false })}
              onDiaClick={(fecha) => setDialogo({ moduloNum: null, categoria: null, nuevo: true, fechaInicial: fecha })}
              onMoverEntrega={(item, nuevaFecha) => confirmarCambio({ moduloNum: item.moduloNum, categoria: item.categoria, subcontrato: item.subcontrato, fechaEntrega: nuevaFecha })}
              esPendiente={(item) => cambios.has(claveCambio(item.moduloNum, item.categoria))}
              emptyMessage="Sin asignaciones todavía — elegí un módulo de la lista o hacé clic en un día para programarlo."
            />
          </div>
        )}
      </CardContent>

      {dialogo && (
        <AsignacionDialog
          dialogo={dialogo}
          modulos={modulosCombinados}
          onClose={() => setDialogo(null)}
          onConfirmar={confirmarCambio}
          onQuitar={quitarCambio}
        />
      )}
    </Card>
  )
}

export default function Configuracion() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Configuración — Avance Obra</h2>
        <p className="text-xs text-muted-foreground">Archivo CR y datos de módulo cargados a mano. Solo visible para quien tenga acceso a esta pestaña.</p>
      </div>
      <UploadCard />
      <AsignacionesCard />
    </div>
  )
}
