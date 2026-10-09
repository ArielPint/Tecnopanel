import { useRef, useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { cn } from '@/lib/utils'
import { guardarEmpresa, importarTrabajadores } from '../lib/apiTrabajadores'
import { descargarPlantilla, leerExcelTrabajadores, type ResultadoLectura } from '../lib/importarTrabajadores'
import { formatearRut } from '../lib/rut'
import type { Area } from '../lib/tipos'
import type { Empresa, FichaTrabajador, TrabajadorV } from '../lib/tiposTrabajadores'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  empresas: Empresa[]
  areas: Area[]
  existentes: TrabajadorV[]
  puedeCrearEmpresas: boolean
  onImportado: () => void
}

const ESTADO_CLASE = {
  nuevo: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  actualiza: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  error: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
}
const ESTADO_LABEL = { nuevo: 'Nuevo', actualiza: 'Actualiza', error: 'Error' }

export function ImportarTrabajadores({ open, onOpenChange, empresas, areas, existentes, puedeCrearEmpresas, onImportado }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<string | null>(null)
  const [lectura, setLectura] = useState<ResultadoLectura | null>(null)
  const [importando, setImportando] = useState(false)

  function cerrar(v: boolean) {
    if (!v) {
      setLectura(null)
      setArchivo(null)
    }
    onOpenChange(v)
  }

  async function leer(f: File | undefined) {
    if (!f) return
    try {
      setArchivo(f.name)
      setLectura(await leerExcelTrabajadores(f, { empresas, areas, existentes, puedeCrearEmpresas }))
    } catch {
      toast.error('No se pudo leer el archivo. ¿Es un Excel (.xlsx / .xls) o CSV?')
      setArchivo(null)
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  const validas = lectura?.filas.filter((f) => f.ficha) ?? []
  const conError = lectura?.filas.filter((f) => f.estado === 'error').length ?? 0

  async function importar() {
    if (!lectura) return
    setImportando(true)
    try {
      // primero las empresas que faltan, para tener su id
      const nuevas = new Map<string, string>()
      for (const nombre of lectura.empresasNuevas) {
        const e = await guardarEmpresa({ nombre })
        nuevas.set(nombre, e.id)
      }
      const fichas: FichaTrabajador[] = validas.map((f) => ({
        ...f.ficha!,
        empresa_id: f.empresaNueva ? nuevas.get(f.empresaNueva)! : f.ficha!.empresa_id,
      }))
      await importarTrabajadores(fichas)
      const n = validas.filter((f) => f.estado === 'nuevo').length
      toast.success(`Importación lista: ${n} nuevos, ${validas.length - n} actualizados${conError ? `, ${conError} filas con error omitidas` : ''}`)
      onImportado()
      cerrar(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo importar')
    } finally {
      setImportando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar trabajadores desde Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Se reconoce cada columna por su encabezado (RUT, Nombres, Apellidos o Nombre completo, Empresa, Cargo, Área, Fecha
            ingreso, Teléfono, Email…). Si el RUT ya existe, la ficha se actualiza; una celda vacía no borra lo que ya tenía.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => input.current?.click()} disabled={importando}>
              <Upload className="mr-1 h-4 w-4" /> {archivo ? 'Elegir otro archivo' : 'Elegir archivo'}
            </Button>
            <Button type="button" variant="outline" onClick={() => descargarPlantilla(empresas, areas)}>
              <FileSpreadsheet className="mr-1 h-4 w-4" /> Descargar plantilla
            </Button>
            <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => leer(e.target.files?.[0])} />
          </div>

          {lectura && (
            <>
              <div className="rounded-md border p-3">
                <p>
                  <span className="font-semibold">{archivo}</span> · {lectura.filas.length} filas:{' '}
                  <span className="text-emerald-700 dark:text-emerald-400">{lectura.filas.filter((f) => f.estado === 'nuevo').length} nuevos</span>,{' '}
                  <span className="text-blue-700 dark:text-blue-400">{lectura.filas.filter((f) => f.estado === 'actualiza').length} se actualizan</span>,{' '}
                  <span className="text-red-700 dark:text-red-400">{conError} con error</span>
                </p>
                {lectura.sinReconocer.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">Columnas que no se usan: {lectura.sinReconocer.join(', ')}</p>
                )}
                {lectura.empresasNuevas.length > 0 && (
                  <p className="mt-1 text-xs">Empresas que se crearán: {lectura.empresasNuevas.join(', ')}</p>
                )}
              </div>
              {lectura.filas.length === 0 ? (
                <p className="text-destructive">No se encontraron filas. ¿La hoja tiene una columna "RUT"?</p>
              ) : (
                <div className="max-h-[45vh] overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">Fila</TableHead>
                        <TableHead>RUT</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Detalle</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lectura.filas.map((f) => (
                        <TableRow key={f.fila}>
                          <TableCell className="font-mono-tabular">{f.fila}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono-tabular">{formatearRut(f.rut)}</TableCell>
                          <TableCell>{f.nombre}</TableCell>
                          <TableCell>
                            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', ESTADO_CLASE[f.estado])}>{ESTADO_LABEL[f.estado]}</span>
                          </TableCell>
                          <TableCell className="text-xs">
                            {f.errores.map((e) => (
                              <p key={e} className="text-destructive">{e}</p>
                            ))}
                            {f.avisos.map((a) => (
                              <p key={a} className="text-muted-foreground">{a}</p>
                            ))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => cerrar(false)} disabled={importando}>
            Cancelar
          </Button>
          <Button onClick={importar} disabled={importando || validas.length === 0}>
            {importando ? 'Importando…' : `Importar ${validas.length} ${validas.length === 1 ? 'fila' : 'filas'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
