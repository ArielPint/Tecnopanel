import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, Plus, Search, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Cargando, Vacio } from '../components/comunes'
import { importarRecetas } from '../lib/api'
import { descargarPlantillaRecetas, leerExcelRecetas, type ResultadoLectura } from '../lib/importarRecetas'
import { RUTA } from '../lib/rutas'
import { usePermisosSip } from '../hooks/usePermisosSip'
import { useCatalogo } from '../hooks/useCatalogo'

const medidas = (p: { ancho_mm: number | null; largo_mm: number | null; espesor_mm: number | null }) =>
  p.ancho_mm && p.largo_mm ? `${p.ancho_mm}×${p.largo_mm}${p.espesor_mm ? `×${p.espesor_mm}` : ''}` : '—'

export default function Paneles() {
  const navigate = useNavigate()
  const { puede } = usePermisosSip('recetas')
  const { paneles, recetas, loading, recargar } = useCatalogo()
  const [texto, setTexto] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)
  const [lectura, setLectura] = useState<(ResultadoLectura & { archivo: string }) | null>(null)
  const [importando, setImportando] = useState(false)
  const inputArchivo = useRef<HTMLInputElement>(null)

  const nMateriales = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of recetas) m.set(r.panel_id, (m.get(r.panel_id) ?? 0) + 1)
    return m
  }, [recetas])

  const q = texto.trim().toLowerCase()
  const visibles = paneles.filter((p) => (verInactivos || p.activo) && (!q || `${p.codigo} ${p.descripcion}`.toLowerCase().includes(q)))
  const inactivos = paneles.filter((p) => !p.activo).length

  async function elegirArchivo(archivo: File | undefined) {
    if (!archivo) return
    try {
      setLectura({ ...(await leerExcelRecetas(archivo)), archivo: archivo.name })
    } catch {
      toast.error('No se pudo leer el archivo. ¿Es un Excel (.xlsx)?')
    } finally {
      if (inputArchivo.current) inputArchivo.current.value = ''
    }
  }

  async function confirmarImportacion() {
    if (!lectura) return
    setImportando(true)
    try {
      const r = await importarRecetas(lectura.filas)
      toast.success(`Importado: ${r.paneles} paneles, ${r.lineas} líneas de receta${r.materiales_nuevos ? `, ${r.materiales_nuevos} materiales nuevos` : ''}`)
      setLectura(null)
      await recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo importar')
    } finally {
      setImportando(false)
    }
  }

  const existentes = new Set(paneles.map((p) => p.codigo))
  const codigosArchivo = lectura ? [...new Set(lectura.filas.map((f) => f.panel_codigo))] : []
  const nuevos = codigosArchivo.filter((c) => !existentes.has(c)).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar código o descripción" value={texto} onChange={(e) => setTexto(e.target.value)} className="pl-8" />
        </div>
        {inactivos > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Ver desactivados ({inactivos})
          </label>
        )}
        {puede('editar') && (
          <>
            <input ref={inputArchivo} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => elegirArchivo(e.target.files?.[0])} />
            <Button variant="outline" onClick={() => inputArchivo.current?.click()}>
              <Upload className="mr-1 h-4 w-4" /> Importar Excel
            </Button>
            <Button asChild>
              <Link to={RUTA.nuevoPanel}>
                <Plus className="mr-1 h-4 w-4" /> Nuevo panel
              </Link>
            </Button>
          </>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <Cargando />
          ) : visibles.length === 0 ? (
            <Vacio>
              {paneles.length === 0 ? 'Aún no hay paneles. Importe el Excel de listas de materiales de SAP (como PNL_SIP.xlsx) o cree uno a mano.' : 'Ningún panel coincide con la búsqueda.'}
            </Vacio>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="hidden sm:table-cell">Medidas (mm)</TableHead>
                    <TableHead className="text-right">Materiales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map((p) => {
                    const n = nMateriales.get(p.id) ?? 0
                    return (
                      <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(RUTA.panel(p.id))}>
                        <TableCell className="font-mono-tabular font-semibold">{p.codigo}</TableCell>
                        <TableCell>
                          {p.descripcion}
                          {!p.activo && (
                            <Badge variant="secondary" className="ml-2">
                              Desactivado
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden font-mono-tabular text-sm sm:table-cell">{medidas(p)}</TableCell>
                        <TableCell className="text-right">
                          {n > 0 ? <span className="font-mono-tabular">{n}</span> : <Badge variant="warning">Sin receta</Badge>}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!lectura} onOpenChange={(o) => !o && !importando && setLectura(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar recetas</DialogTitle>
            <DialogDescription>{lectura?.archivo}</DialogDescription>
          </DialogHeader>
          {lectura && (
            <div className="space-y-3 text-sm">
              {lectura.filas.length > 0 && (
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <b>{lectura.paneles}</b> paneles ({nuevos} nuevos, {lectura.paneles - nuevos} existentes) con <b>{lectura.filas.length}</b> líneas de receta.
                  </li>
                  <li>Se usa solo la <b>Cantidad base</b> (lo que consume 1 panel).</li>
                  <li>
                    La receta de cada panel del archivo se <b>reemplaza</b> entera. Los paneles que no vienen en el archivo no se tocan, y la producción ya
                    registrada conserva la receta con que se registró.
                  </li>
                </ul>
              )}
              {lectura.errores.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
                  <p className="mb-1 font-semibold text-destructive">
                    {lectura.errores.length} {lectura.errores.length === 1 ? 'fila no se puede importar' : 'filas no se pueden importar'}:
                  </p>
                  <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-xs">
                    {lectura.errores.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs">Corríjalas en el Excel y vuelva a cargarlo: no se importa nada mientras haya errores.</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" size="sm" onClick={descargarPlantillaRecetas}>
              <Download className="mr-1 h-4 w-4" /> Plantilla
            </Button>
            <Button onClick={confirmarImportacion} disabled={importando || !lectura || lectura.filas.length === 0 || lectura.errores.length > 0}>
              {importando ? 'Importando…' : 'Importar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
