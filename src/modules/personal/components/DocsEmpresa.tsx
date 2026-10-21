import { useState } from 'react'
import { CheckCircle2, Circle, FileText, ListChecks, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatearRut } from '@/modules/sso/lib/rut'
import { fmtFecha, fmtFechaHora } from '@/modules/sso/lib/estados'
import { ARCHIVOS_ACEPTADOS, abrirArchivo, type DocEmpresa, type Listado } from '../lib/api'
import { nombreMes } from '../lib/contratistas'

// Piezas del control mensual de contratistas, compartidas por la pantalla Contratistas (RRHH,
// Prevención, coordinadores) y por el portal de cada empresa (/contratistas).

const msg = (err: unknown, porDefecto: string) => (err instanceof Error ? err.message : porDefecto)

/** Un tipo de documento del mes: sus archivos y el botón para subir otro. */
export function CeldaDoc({
  titulo,
  archivos,
  puedeSubir,
  puedeBorrar,
  ocupado,
  onSubir,
  onBorrar,
}: {
  titulo: string
  archivos: DocEmpresa[]
  puedeSubir: boolean
  puedeBorrar: (d: DocEmpresa) => boolean
  ocupado: boolean
  onSubir: (f: File) => void
  onBorrar: (d: DocEmpresa) => void
}) {
  const ok = archivos.length > 0
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5 rounded-md border p-2.5', ok ? 'border-success/40 bg-success/5' : 'border-dashed')}>
      <p className="flex items-start gap-1.5 text-xs font-semibold">
        {ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" /> : <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
        {titulo}
      </p>
      {archivos.map((d) => (
        <div key={d.id} className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => abrirArchivo(d).catch((err) => toast.error(msg(err, 'No se pudo abrir')))}
            className="inline-flex min-w-0 items-center gap-1 text-brand hover:underline"
            title={`Cargado el ${fmtFecha(d.created_at.slice(0, 10))}`}
          >
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{d.nombre}</span>
          </button>
          {puedeBorrar(d) && (
            <button type="button" onClick={() => onBorrar(d)} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Eliminar ${d.nombre}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      {puedeSubir && (
        <label
          className={cn(
            'mt-auto inline-flex h-7 w-fit cursor-pointer items-center gap-1 rounded-md border px-2 text-[11px] font-semibold hover:bg-accent',
            ocupado && 'pointer-events-none opacity-50',
          )}
        >
          <Upload className="h-3 w-3" /> {ok ? 'Agregar' : 'Subir'}
          <input
            type="file"
            accept={ARCHIVOS_ACEPTADOS}
            className="sr-only"
            disabled={ocupado}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) onSubir(f)
            }}
          />
        </label>
      )}
    </div>
  )
}

/** El listado de trabajadores del mes: confirmado (con la foto de ese día) o por confirmar. */
export function CeldaListado({
  periodo,
  listado,
  activos,
  puedeConfirmar,
  ocupado,
  onConfirmar,
}: {
  periodo: string
  listado: Listado | undefined
  /** trabajadores activos hoy (solo lo sabe la propia empresa o Prevención) */
  activos?: number
  puedeConfirmar: boolean
  ocupado: boolean
  onConfirmar: () => void
}) {
  const [ver, setVer] = useState(false)
  const ok = !!listado
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5 rounded-md border p-2.5', ok ? 'border-success/40 bg-success/5' : 'border-dashed')}>
      <p className="flex items-start gap-1.5 text-xs font-semibold">
        {ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" /> : <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
        Listado de trabajadores
      </p>
      {listado ? (
        <button type="button" onClick={() => setVer(true)} className="inline-flex w-fit items-center gap-1 text-xs text-brand hover:underline">
          <ListChecks className="h-3.5 w-3.5" />
          {listado.total === 1 ? '1 trabajador' : `${listado.total} trabajadores`} · {fmtFecha(listado.confirmado_at.slice(0, 10))}
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sin confirmar{activos !== undefined && ` · ${activos === 1 ? '1 trabajador activo' : `${activos} trabajadores activos`}`}
        </p>
      )}
      {puedeConfirmar && (
        <Button size="sm" variant="outline" className="mt-auto h-7 w-fit px-2 text-[11px]" disabled={ocupado} onClick={onConfirmar}>
          {ok ? 'Volver a confirmar' : 'Confirmar listado'}
        </Button>
      )}

      {listado && (
        <Dialog open={ver} onOpenChange={setVer}>
          <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
            <DialogHeader>
              <DialogTitle>Listado de {nombreMes(periodo)}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Confirmado el {fmtFechaHora(listado.confirmado_at)}: {listado.total === 1 ? '1 trabajador activo' : `${listado.total} trabajadores activos`} en ese momento.
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">RUT</th>
                    <th className="px-3 py-2 font-semibold">Nombre</th>
                    <th className="px-3 py-2 font-semibold">Cargo</th>
                    <th className="px-3 py-2 font-semibold">Sucursal</th>
                  </tr>
                </thead>
                <tbody>
                  {listado.trabajadores.map((t) => (
                    <tr key={t.rut} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono-tabular">{formatearRut(t.rut)}</td>
                      <td className="px-3 py-1.5">{t.nombre}</td>
                      <td className="px-3 py-1.5">{t.cargo ?? '—'}</td>
                      <td className="px-3 py-1.5">{t.sucursal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
