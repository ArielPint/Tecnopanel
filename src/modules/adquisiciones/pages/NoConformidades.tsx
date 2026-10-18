import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { cn } from '@/lib/utils'
import { ESTADOS_NC, IMPACTOS_NC, TIPOS_NC, cerrarNc, fmtPesos, listarNc, type Nc } from '../lib/api'
import { RUTA } from '../lib/rutas'
import { usePermisosAdq } from '../hooks/usePermisosAdq'
import { DialogoNc } from '../components/DialogosProveedor'

// No conformidades de proveedores: registro, seguimiento y cierre. Son antecedente de la evaluación.

const fecha = (s: string | null) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString('es-CL') : '—')

const IMPACTO_VARIANT: Record<Nc['impacto'], 'secondary' | 'default' | 'warning' | 'destructive'> = {
  bajo: 'secondary',
  medio: 'default',
  alto: 'warning',
  critico: 'destructive',
}

/** Tabla de NC con editar y cerrar; la usan la bandeja y la ficha del proveedor. */
export function TablaNc({ filas, mostrarProveedor, onCambio }: { filas: Nc[]; mostrarProveedor: boolean; onCambio: () => void }) {
  const { sucursales } = usePermisosAdq()
  const [editar, setEditar] = useState<Nc | null>(null)
  const [cerrar, setCerrar] = useState<Nc | null>(null)
  const [cierre, setCierre] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (filas.length === 0) return <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No hay no conformidades.</p>
  return (
    <>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-semibold">N° · fecha</th>
              {mostrarProveedor && <th className="px-3 py-2 font-semibold">Proveedor</th>}
              <th className="px-3 py-2 font-semibold">Problema</th>
              <th className="px-3 py-2 font-semibold">Tipo · impacto</th>
              <th className="px-3 py-2 font-semibold">Compromiso</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
              <th className="w-20 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filas.map((n) => (
              <tr key={n.id} className="border-b align-top last:border-0">
                <td className="px-3 py-2 font-mono-tabular">
                  N° {n.id}
                  <p className="text-[11px] text-muted-foreground">
                    {fecha(n.fecha_evento)} · {n.sucursal}
                  </p>
                </td>
                {mostrarProveedor && (
                  <td className="px-3 py-2">
                    {n.proveedor_codigo ? (
                      <Link to={RUTA.proveedor(n.proveedor_codigo)} className="font-medium hover:underline">
                        {n.proveedor_nombre}
                      </Link>
                    ) : (
                      n.proveedor_nombre
                    )}
                  </td>
                )}
                <td className="px-3 py-2">
                  <p className="max-w-[360px] whitespace-pre-line">{n.problema}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {[n.articulo_nombre ?? n.articulo_codigo, n.oc_docnum && `OC ${n.oc_docnum}`, n.costo != null && fmtPesos(n.costo), n.reincidencia && 'reincidencia']
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {n.accion_acordada && <p className="text-[12px] text-muted-foreground">Acción: {n.accion_acordada}</p>}
                  {n.cierre && (
                    <p className="text-[12px] text-success">
                      Cierre {fecha(n.cerrado_at)} · {n.cerrado_por_nombre}: {n.cierre}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2">
                  <p>{TIPOS_NC[n.tipo]}</p>
                  <Badge variant={IMPACTO_VARIANT[n.impacto]}>{IMPACTOS_NC[n.impacto]}</Badge>
                </td>
                <td className={cn('px-3 py-2 font-mono-tabular', n.vencida && 'font-semibold text-destructive')}>
                  {fecha(n.fecha_compromiso)}
                  {n.vencida && <p className="text-[11px]">vencida</p>}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={n.estado === 'cerrada' ? 'success' : n.estado === 'abierta' ? 'warning' : 'default'}>{ESTADOS_NC[n.estado]}</Badge>
                </td>
                <td className="px-3 py-2">
                  {n.estado !== 'cerrada' && (
                    <div className="flex gap-1">
                      <button onClick={() => setEditar(n)} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Editar NC ${n.id}`}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setCerrar(n)} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Cerrar NC ${n.id}`}>
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DialogoNc abierto={!!editar} nc={editar} proveedor={null} sucursales={sucursales.compras} onCerrar={() => setEditar(null)} onGuardado={onCambio} />

      <Dialog open={!!cerrar} onOpenChange={(o) => !o && (setCerrar(null), setCierre(''))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar NC N° {cerrar?.id}</DialogTitle>
            <DialogDescription>Describe la solución aplicada y cómo se verificó.</DialogDescription>
          </DialogHeader>
          <Textarea value={cierre} onChange={(e) => setCierre(e.target.value)} placeholder="Solución o cierre" aria-label="Solución o cierre" />
          <DialogFooter>
            <Button variant="outline" onClick={() => (setCerrar(null), setCierre(''))}>
              Cancelar
            </Button>
            <Button
              disabled={enviando || !cierre.trim()}
              onClick={async () => {
                if (!cerrar) return
                setEnviando(true)
                try {
                  await cerrarNc(cerrar.id, cierre)
                  toast.success('NC cerrada')
                  setCerrar(null)
                  setCierre('')
                  onCambio()
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'No se pudo cerrar')
                } finally {
                  setEnviando(false)
                }
              }}
            >
              {enviando ? 'Cerrando…' : 'Cerrar NC'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function NoConformidades() {
  const { sucursales } = usePermisosAdq()
  const [filas, setFilas] = useState<Nc[]>([])
  const [loading, setLoading] = useState(true)
  const [estado, setEstado] = useState<'abiertas' | 'vencidas' | 'cerradas' | 'todas'>('abiertas')
  const [texto, setTexto] = useState('')
  const [nueva, setNueva] = useState(false)

  const cargar = () =>
    listarNc()
      .then(setFilas)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  useEffect(() => {
    cargar()
  }, [])

  const cumple = (n: Nc, e: typeof estado) =>
    e === 'todas' ? true : e === 'abiertas' ? n.estado !== 'cerrada' : e === 'vencidas' ? n.vencida : n.estado === 'cerrada'
  const lista = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return filas
      .filter((n) => cumple(n, estado))
      .filter((n) => !q || n.proveedor_nombre.toLowerCase().includes(q) || n.problema.toLowerCase().includes(q) || String(n.oc_docnum ?? '') === q || String(n.id) === q)
  }, [filas, estado, texto]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">No conformidades</h1>
          <p className="text-sm text-muted-foreground">Reclamos a proveedores por calidad, entrega, embalaje, documentación o cantidad, con su acción y cierre.</p>
        </div>
        <Button size="sm" onClick={() => setNueva(true)}>
          <Plus className="mr-1 h-4 w-4" /> Registrar NC
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['abiertas', 'Abiertas'],
            ['vencidas', 'Compromiso vencido'],
            ['cerradas', 'Cerradas'],
            ['todas', 'Todas'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setEstado(k)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              estado === k ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {label} <span className="tabular-nums opacity-70">{filas.filter((n) => cumple(n, k)).length}</span>
          </button>
        ))}
      </div>
      <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por proveedor, problema, N° de NC u OC" className="h-9 w-full sm:w-80" />
      {loading ? <div className="h-40 animate-pulse rounded bg-muted" /> : <TablaNc filas={lista} mostrarProveedor onCambio={cargar} />}
      <DialogoNc abierto={nueva} nc={null} proveedor={null} sucursales={sucursales.compras} onCerrar={() => setNueva(false)} onGuardado={cargar} />
    </div>
  )
}
