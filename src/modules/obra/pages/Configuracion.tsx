import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { useObraCrData } from '../hooks/useObraCrData'
import { useObraCrExcel } from '../hooks/useObraCrExcel'
import { useObraCrConfigSave } from '../hooks/useObraCrConfigSave'

const SUBCONTRATO_LABEL: Record<string, string> = { W: 'Wedo', C: 'Conbes', sin_asignar: 'Sin asignar' }

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

function ModulosConfigCard() {
  const { modulos, loading } = useObraCrData()
  const { guardar, guardandoNum } = useObraCrConfigSave()
  const [filtro, setFiltro] = useState('')

  const filtrados = useMemo(() => {
    if (!filtro.trim()) return modulos
    const q = filtro.trim()
    return modulos.filter((m) => String(m.moduloNum).includes(q))
  }, [modulos, filtro])

  return (
    <Card>
      <CardHeader>
        <CardTitle>🏗️ Asignación de subcontrato y fecha de entrega final</CardTitle>
        <CardDescription>Por módulo — reemplaza el Excel "Entrega Contratistas" del reporte original. Alimenta las secciones Wedo/Conbes y la grilla de Entrega a Cliente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input placeholder="Buscar módulo (ej: 093)" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-8 w-52 text-xs" />
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : !modulos.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin módulos — subí primero el archivo CR.</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Subcontrato</TableHead>
                  <TableHead>Fecha entrega final</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((m) => (
                  <TableRow key={m.moduloNum} className={guardandoNum === m.moduloNum ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">{m.code}</TableCell>
                    <TableCell className="text-muted-foreground">{m.tipo}</TableCell>
                    <TableCell>
                      <Select
                        value={m.subcontrato ?? 'sin_asignar'}
                        onValueChange={(v) => guardar(m.moduloNum, { subcontrato: v === 'sin_asignar' ? null : (v as 'W' | 'C'), fechaEntregaFinal: m.fechaEntregaFinal })}
                      >
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(SUBCONTRATO_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        key={m.fechaEntregaFinal ?? 'sin_fecha'}
                        type="date"
                        defaultValue={m.fechaEntregaFinal ?? ''}
                        className="h-8 w-40"
                        onBlur={(e) => {
                          const v = e.target.value || null
                          if (v !== m.fechaEntregaFinal) guardar(m.moduloNum, { subcontrato: m.subcontrato, fechaEntregaFinal: v })
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
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
      <ModulosConfigCard />
    </div>
  )
}
