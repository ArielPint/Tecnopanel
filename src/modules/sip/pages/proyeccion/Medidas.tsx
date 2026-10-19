import { useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/financiero/components/ui/table'
import { Cargando } from '../../components/comunes'
import { eliminarMedida, guardarMedida, listarMedidas, type MedidaProy } from '../../lib/proyeccion'
import { usePermisosSip } from '../../hooks/usePermisosSip'

type Fila = { articulo: string; descripcion: string; unidad: string; prioridad: string; nueva: boolean; cambiada: boolean }

const aFila = (m: MedidaProy): Fila => ({ ...m, prioridad: String(m.prioridad), nueva: false, cambiada: false })

/** Maquilas de la Estructura de proyecto de SAP que dan la medida de lo producido. */
export default function Medidas() {
  const { puedeEn } = usePermisosSip()
  const editor = puedeEn('proyeccion', 'editar')
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let cancelado = false
    listarMedidas()
      .then((m) => !cancelado && setFilas(m.map(aFila)))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Error al cargar')
        if (!cancelado) setFilas([])
      })
    return () => {
      cancelado = true
    }
  }, [recarga])

  if (!filas) return <Cargando />

  const cambiar = (i: number, c: Partial<Fila>) => setFilas((l) => l!.map((f, j) => (j === i ? { ...f, ...c, cambiada: true } : f)))

  const guardar = async () => {
    try {
      for (const f of filas.filter((x) => x.cambiada)) {
        const prioridad = Number(f.prioridad)
        if (!/^\d+$/.test(f.articulo.trim()) || !f.unidad.trim() || !Number.isInteger(prioridad)) {
          toast.error(`Revisa la fila ${f.articulo || '(nueva)'}: código numérico, unidad y prioridad entera`)
          return
        }
        await guardarMedida({ articulo: f.articulo.trim(), descripcion: f.descripcion.trim(), unidad: f.unidad.trim(), prioridad })
      }
      toast.success('Medidas guardadas: se aplican en la próxima sincronización con SAP (cada hora)')
      setRecarga((x) => x + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  const quitar = async (i: number) => {
    const f = filas[i]
    if (f.nueva) {
      setFilas((l) => l!.filter((_, j) => j !== i))
      return
    }
    try {
      await eliminarMedida(f.articulo)
      setRecarga((x) => x + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo quitar')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Medidas desde la estructura de proyecto</CardTitle>
        <p className="text-xs text-muted-foreground">
          Cada línea de OV busca en la Estructura de proyecto de SAP (mismo tipo de vivienda y tipo) una de estas maquilas: su cantidad
          es la medida por unidad. Si hay varias, gana la de menor prioridad. Los kits sin medida propia suman la de sus componentes a $0.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 p-0 pb-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código SAP</TableHead>
              <TableHead>Maquila</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead className="text-right">Prioridad</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f, i) => (
              <TableRow key={f.nueva ? `n${i}` : f.articulo}>
                <TableCell>
                  {f.nueva ? (
                    <Input value={f.articulo} onChange={(e) => cambiar(i, { articulo: e.target.value })} placeholder="65011xx" className="w-28" />
                  ) : (
                    <span className="font-mono-tabular">{f.articulo}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Input value={f.descripcion} onChange={(e) => cambiar(i, { descripcion: e.target.value })} disabled={!editor} className="min-w-[240px]" />
                </TableCell>
                <TableCell>
                  <Input value={f.unidad} onChange={(e) => cambiar(i, { unidad: e.target.value })} disabled={!editor} className="w-20" />
                </TableCell>
                <TableCell className="text-right">
                  <Input value={f.prioridad} onChange={(e) => cambiar(i, { prioridad: e.target.value })} disabled={!editor} inputMode="numeric" className="ml-auto w-20 text-right" />
                </TableCell>
                <TableCell>
                  {editor && (
                    <Button variant="ghost" size="icon-sm" onClick={() => quitar(i)} aria-label="Quitar">
                      <Trash2 />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {editor && (
          <div className="flex gap-2 px-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilas((l) => [...l!, { articulo: '', descripcion: '', unidad: '', prioridad: '100', nueva: true, cambiada: true }])}
            >
              <Plus /> Agregar maquila
            </Button>
            <Button size="sm" onClick={guardar} disabled={!filas.some((f) => f.cambiada)}>
              <Save /> Guardar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
