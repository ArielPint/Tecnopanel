import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSpreadsheet, Plus, Search, Upload } from 'lucide-react'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { cn } from '@/lib/utils'
import { listarTrabajadores } from '../lib/apiTrabajadores'
import { exportarTrabajadoresExcel } from '../lib/importarTrabajadores'
import { formatearRut, normalizarRut } from '../lib/rut'
import { RUTA } from '../lib/rutas'
import type { TrabajadorV } from '../lib/tiposTrabajadores'
import { usePermisosSso } from '../hooks/usePermisosSso'
import { useDatosSso } from '../hooks/useDatosSso'
import { useCatalogosTrabajadores } from '../hooks/useCatalogosTrabajadores'
import { FormTrabajador } from '../components/FormTrabajador'
import { ImportarTrabajadores } from '../components/ImportarTrabajadores'

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

export default function Trabajadores() {
  const navigate = useNavigate()
  const { puede, puedeEn } = usePermisosSso('trabajadores')
  const { areas, nombreArea } = useDatosSso()
  const { empresas } = useCatalogosTrabajadores()
  const [lista, setLista] = useState<TrabajadorV[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [importar, setImportar] = useState(false)

  const [texto, setTexto] = useState('')
  const [empresaId, setEmpresaId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [verBajas, setVerBajas] = useState(false)
  const [soloAlertas, setSoloAlertas] = useState(false)
  const salud = puede('aprobar')

  const cargar = useCallback(async () => {
    try {
      setLista(await listarTrabajadores())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar trabajadores')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const cargos = useMemo(() => [...new Set(lista.map((t) => t.cargo).filter((c): c is string => !!c))].sort(), [lista])

  const filtrados = useMemo(() => {
    const q = texto.trim().toLowerCase()
    const qRut = normalizarRut(texto)?.split('-')[0] ?? texto.replace(/[^0-9kK]/g, '')
    return lista.filter((t) => {
      if (!verBajas && !t.activo) return false
      if (empresaId && t.empresa_id !== empresaId) return false
      if (areaId && t.area_id !== areaId) return false
      if (soloAlertas && t.examenes_vencidos + t.examenes_por_vencer + t.examenes_con_restriccion === 0) return false
      if (!q) return true
      return `${t.nombres} ${t.apellidos} ${t.cargo ?? ''}`.toLowerCase().includes(q) || (qRut.length >= 3 && t.rut.replace('-', '').includes(qRut))
    })
  }, [lista, texto, empresaId, areaId, verBajas, soloAlertas])

  const activos = lista.filter((t) => t.activo)
  const contratistas = activos.filter((t) => !t.empresa_propia).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold">Trabajadores</h1>
          <p className="text-sm text-muted-foreground">
            {activos.length} activos · {activos.length - contratistas} propios · {contratistas} de contratistas
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puede('exportar') && (
            <Button size="sm" variant="outline" disabled={filtrados.length === 0} onClick={() => exportarTrabajadoresExcel(filtrados, nombreArea, salud)}>
              <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel ({filtrados.length})
            </Button>
          )}
          {puede('crear') && (
            <>
              <Button size="sm" variant="outline" onClick={() => setImportar(true)}>
                <Upload className="mr-1 h-4 w-4" /> Importar Excel
              </Button>
              <Button size="sm" onClick={() => setNuevo(true)}>
                <Plus className="mr-1 h-4 w-4" /> Nuevo trabajador
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, RUT o cargo" value={texto} onChange={(e) => setTexto(e.target.value)} className="pl-8" />
        </div>
        <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className={selectClase} aria-label="Empresa">
          <option value="">Todas las empresas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
        <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={selectClase} aria-label="Área">
          <option value="">Todas las áreas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={verBajas} onCheckedChange={(v) => setVerBajas(!!v)} /> Incluir bajas
          </label>
          {salud && (
            <label className="flex items-center gap-2">
              <Checkbox checked={soloAlertas} onCheckedChange={(v) => setSoloAlertas(!!v)} /> Exámenes por revisar
            </label>
          )}
        </div>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : filtrados.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {lista.length === 0 ? 'Todavía no hay trabajadores. Agrégalos uno a uno o importa un Excel.' : 'Ningún trabajador coincide con los filtros.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>RUT</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Cargo / área</TableHead>
                  {salud && <TableHead>Exámenes</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((t) => (
                  <TableRow key={t.id} className={cn('cursor-pointer', !t.activo && 'opacity-60')} onClick={() => navigate(RUTA.trabajador(t.id))}>
                    <TableCell className="font-medium">
                      {t.apellidos}, {t.nombres}
                      {!t.activo && <span className="ml-2 text-xs font-normal text-muted-foreground">(de baja)</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono-tabular">{formatearRut(t.rut)}</TableCell>
                    <TableCell>
                      {t.empresa}
                      {!t.empresa_propia && <span className="ml-1 text-xs text-muted-foreground">(contratista)</span>}
                    </TableCell>
                    <TableCell>
                      <p>{t.cargo ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{t.area_id ? nombreArea(t.area_id) : 'Sin área'}</p>
                    </TableCell>
                    {salud && (
                      <TableCell className="space-x-1 whitespace-nowrap text-[11px] font-semibold">
                        {t.examenes_vencidos > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-white">{t.examenes_vencidos} vencido{t.examenes_vencidos > 1 ? 's' : ''}</span>}
                        {t.examenes_por_vencer > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-200">{t.examenes_por_vencer} por vencer</span>}
                        {t.examenes_con_restriccion > 0 && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800 dark:bg-blue-950 dark:text-blue-200">con restricción</span>}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <FormTrabajador
        open={nuevo}
        onOpenChange={setNuevo}
        empresas={empresas}
        areas={areas}
        cargos={cargos}
        onGuardado={(id) => navigate(RUTA.trabajador(id))}
      />
      <ImportarTrabajadores
        open={importar}
        onOpenChange={setImportar}
        empresas={empresas}
        areas={areas}
        existentes={lista}
        puedeCrearEmpresas={puedeEn('configuracion', 'editar')}
        onImportado={cargar}
      />
    </div>
  )
}
