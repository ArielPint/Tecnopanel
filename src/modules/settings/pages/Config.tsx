import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Button } from '@/modules/financiero/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { fmtM } from '@/modules/planta/lib/format'
import { useExcelData } from '@/modules/planta/hooks/useExcelData'
import { useAvanceProduccionExcel } from '@/modules/planta/hooks/useAvanceProduccionExcel'
import { useConfigFinanciero, useRitmoProyeccion, useTablaAnual, useAvanceEconProy, MESES } from '../hooks/useConfig'

const ANIOS = [2026, 2027, 2028]

export default function Config() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Configuración del proyecto</h2>
        <p className="text-xs text-muted-foreground">Parámetros y valores de referencia. Solo visible para administradores.</p>
      </div>
      <ExcelUploadCard />
      <AvanceProduccionUploadCard />
      <PresupuestoCard />
      <RitmoCard />
      <AvanceEconProyCard />
      <TablaAnualCard
        titulo="Ajuste manual de compras"
        descripcion="Monto adicional por mes — se suma al total de compras reales del dashboard"
        tabla="ajustes_compras"
        unidad="$"
        toInput={(v) => String(v)}
        fromInput={(v) => parseFloat(v) || 0}
      />
    </div>
  )
}

function ExcelUploadCard() {
  const { excelData, autoLoading, uploading, error, handleFile } = useExcelData()

  return (
    <Card>
      <CardHeader>
        <CardTitle>📄 Archivo Excel del proyecto</CardTitle>
        <CardDescription>Sube LA CHACRA.xlsm para actualizar avance, módulos, compras y stock del dashboard</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          {autoLoading ? 'Cargando estado…' : excelData ? 'Archivo cargado — subir uno nuevo lo reemplaza para todo el equipo.' : 'Sin archivo cargado todavía.'}
        </p>
        <Button asChild disabled={uploading || autoLoading}>
          <label className="cursor-pointer">
            {uploading ? 'Procesando…' : 'Subir archivo .xlsm'}
            <input
              type="file"
              accept=".xlsm,.xlsx"
              className="hidden"
              disabled={uploading || autoLoading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </label>
        </Button>
      </CardContent>
    </Card>
  )
}

function AvanceProduccionUploadCard() {
  const { uploading, error, lastResult, handleFile } = useAvanceProduccionExcel()

  return (
    <Card>
      <CardHeader>
        <CardTitle>🏗️ Excel de avance de producción (avance.xlsx)</CardTitle>
        <CardDescription>Alimenta el módulo Producción desde la hoja BD_AVANCE — torre, módulo, tipo, estado y el checklist por partida (obra gruesa, sanitario, eléctrico y parte de terminaciones)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-xs text-destructive">{error}</p>}
        {lastResult && !error && (
          <p className="text-xs text-success">{lastResult.nuevos} módulo(s) nuevo(s), {lastResult.actualizados} actualizado(s).</p>
        )}
        <Button asChild disabled={uploading}>
          <label className="cursor-pointer">
            {uploading ? 'Procesando…' : 'Subir archivo de avance'}
            <input
              type="file"
              accept=".xlsm,.xlsx"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </label>
        </Button>
      </CardContent>
    </Card>
  )
}

function PresupuestoCard() {
  const { totalComprado, presupuesto, loading, guardarPresupuesto } = useConfigFinanciero()
  const [valor, setValor] = useState('')
  const [guardando, setGuardando] = useState(false)

  const inputValor = valor || (presupuesto != null ? String(Math.round(presupuesto)) : '')
  const ejecucion = totalComprado != null && presupuesto ? (totalComprado / presupuesto) * 100 : null

  async function onGuardar() {
    const num = parseFloat(inputValor)
    if (!num || num <= 0) {
      toast.error('Ingresá un valor válido')
      return
    }
    setGuardando(true)
    try {
      await guardarPresupuesto(num)
      setValor('')
      toast.success('Presupuesto guardado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>💰 Presupuesto del proyecto</CardTitle>
        <CardDescription>Total comprado calculado desde Supabase · Presupuesto editable</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Total comprado</p>
            <p className="text-lg font-semibold">{loading ? '—' : fmtM(totalComprado)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Presupuesto total</p>
            <p className="text-lg font-semibold text-muted-foreground">{loading ? '—' : fmtM(presupuesto)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">% Ejecución</p>
            <p className={`text-lg font-semibold ${ejecucion != null && ejecucion > 100 ? 'text-destructive' : 'text-green-600'}`}>
              {ejecucion != null ? ejecucion.toFixed(2) + '%' : '—'}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inp-presupuesto">Presupuesto total ($)</Label>
          <Input
            id="inp-presupuesto"
            type="number"
            min={0}
            step={1000000}
            placeholder="ej. 6579000000"
            value={inputValor}
            onChange={(e) => setValor(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">Sin puntos ni comas</span>
        </div>
        <Button size="sm" disabled={guardando} onClick={onGuardar}>
          {guardando ? 'Guardando…' : 'Guardar presupuesto'}
        </Button>
      </CardContent>
    </Card>
  )
}

function RitmoCard() {
  const { ritmoTope, ritmoTorre3, loading, guardar } = useRitmoProyeccion()
  const [tope, setTope] = useState('')
  const [torre3, setTorre3] = useState('')
  const [guardando, setGuardando] = useState(false)

  const vTope = tope || (loading ? '' : String(ritmoTope))
  const vTorre3 = torre3 || (loading ? '' : String(ritmoTorre3))

  async function onGuardar() {
    const t = parseFloat(vTope)
    const t3 = parseFloat(vTorre3)
    if (!t || t <= 0 || !t3 || t3 <= 0) {
      toast.error('Ingresá valores válidos')
      return
    }
    setGuardando(true)
    try {
      await guardar(t, t3)
      toast.success('Ritmo guardado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>🔮 Proyección — ritmo de módulos</CardTitle>
        <CardDescription>Parámetros del cálculo de escenarios en la pestaña Proyección del dashboard</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inp-ritmo-tope">Ritmo tope del proyecto (mód/semana)</Label>
            <Input id="inp-ritmo-tope" type="number" min={0} step={0.5} placeholder="ej. 15" value={vTope} onChange={(e) => setTope(e.target.value)} />
            <span className="text-xs text-muted-foreground">Ningún escenario puede superar este ritmo</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inp-ritmo-torre3">Ritmo Torre 3 (mód/semana)</Label>
            <Input id="inp-ritmo-torre3" type="number" min={0} step={0.5} placeholder="ej. 6" value={vTorre3} onChange={(e) => setTorre3(e.target.value)} />
            <span className="text-xs text-muted-foreground">Ritmo objetivo fijo mientras Torre 3 no esté 100% terminada</span>
          </div>
        </div>
        <Button size="sm" disabled={guardando} onClick={onGuardar}>
          {guardando ? 'Guardando…' : 'Guardar ritmo'}
        </Button>
      </CardContent>
    </Card>
  )
}

const FORECAST_COLORS = ['#4f8ef7', '#f2a340', '#a371f7', '#3fb950', '#f75f5f', '#40c4c4']

function AvanceEconProyCard() {
  const { anio, setAnio, columnas, loading, agregarColumna, actualizarLabel, actualizarValor, guardar } = useAvanceEconProy()
  const [guardando, setGuardando] = useState(false)

  async function onGuardar() {
    setGuardando(true)
    try {
      await guardar()
      toast.success('Guardado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avance económico proyectado</CardTitle>
        <CardDescription>% mensual proyectado — cada columna es un forecast y agrega su propia línea al gráfico del dashboard</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Label>Año</Label>
          <Select value={String(anio)} onValueChange={(v) => setAnio(parseInt(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANIOS.map((a) => (
                <SelectItem key={a} value={String(a)}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                {columnas.map((c, i) => (
                  <TableHead key={c.key} className="min-w-36 text-right">
                    <Input
                      value={c.label}
                      placeholder="Nombre del forecast"
                      onChange={(e) => actualizarLabel(c.key, e.target.value)}
                      className="h-7 border-2 text-xs"
                      style={{ borderColor: FORECAST_COLORS[i % FORECAST_COLORS.length] }}
                    />
                  </TableHead>
                ))}
                <TableHead className="w-10">
                  <Button type="button" size="icon-sm" variant="outline" onClick={agregarColumna} title="Agregar forecast">
                    +
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MESES.map((mes, mesIdx) => (
                <TableRow key={mes}>
                  <TableCell>{mes}</TableCell>
                  {columnas.map((c) => (
                    <TableCell key={c.key} className="text-right">
                      <Input
                        type="number"
                        className="ml-auto w-28 text-right"
                        value={loading ? '' : (c.valores[mesIdx] * 100).toFixed(4)}
                        onChange={(e) => actualizarValor(c.key, mesIdx, (parseFloat(e.target.value) || 0) / 100)}
                      />
                    </TableCell>
                  ))}
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Button size="sm" disabled={guardando || loading} onClick={onGuardar}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      </CardContent>
    </Card>
  )
}

interface TablaAnualCardProps {
  titulo: string
  descripcion: string
  tabla: 'ajustes_compras'
  unidad: string
  toInput: (v: number) => string
  fromInput: (v: string) => number
}

function TablaAnualCard({ titulo, descripcion, tabla, unidad, toInput, fromInput }: TablaAnualCardProps) {
  const { anio, setAnio, filas, setFilas, loading, guardar } = useTablaAnual(tabla)
  const [guardando, setGuardando] = useState(false)

  function onCambiar(i: number, value: string) {
    setFilas(filas.map((f, idx) => (idx === i ? { ...f, valor: fromInput(value) } : f)))
  }

  async function onGuardar() {
    setGuardando(true)
    try {
      await guardar(filas)
      toast.success('Guardado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Label>Año</Label>
          <Select value={String(anio)} onValueChange={(v) => setAnio(parseInt(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANIOS.map((a) => (
                <SelectItem key={a} value={String(a)}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">{unidad}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MESES.map((mes, i) => (
                <TableRow key={mes}>
                  <TableCell>{mes}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      className="ml-auto w-32 text-right"
                      value={loading ? '' : toInput(filas[i]?.valor ?? 0)}
                      onChange={(e) => onCambiar(i, e.target.value)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Button size="sm" disabled={guardando || loading} onClick={onGuardar}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      </CardContent>
    </Card>
  )
}
