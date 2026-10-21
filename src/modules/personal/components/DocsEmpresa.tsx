import { useState, type FormEvent } from 'react'
import { Check, CheckCircle2, Circle, Clock, FileText, ListChecks, Trash2, Upload, X, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatearRut } from '@/modules/sso/lib/rut'
import { fmtFecha, fmtFechaHora } from '@/modules/sso/lib/estados'
import { ARCHIVOS_ACEPTADOS, abrirArchivo, type DocEmpresa, type EstadoRevision, type Listado } from '../lib/api'
import { nombreMes } from '../lib/contratistas'

// Piezas del control mensual de contratistas, compartidas por la pantalla Contratistas (RRHH,
// Prevención, coordinadores y quienes validan) y por el portal de cada empresa (/contratistas).
// Cada documento y el listado quedan por revisar hasta que Tecnopanel los aprueba o los rechaza.

const msg = (err: unknown, porDefecto: string) => (err instanceof Error ? err.message : porDefecto)

export type Revisar = (aprobar: boolean, motivo?: string) => void

const ESTADO_REV: Record<EstadoRevision, { label: string; clase: string; icono: typeof Clock }> = {
  por_revisar: { label: 'Por revisar', clase: 'text-muted-foreground', icono: Clock },
  aprobado: { label: 'Aprobado', clase: 'text-success', icono: CheckCircle2 },
  rechazado: { label: 'Rechazado', clase: 'text-destructive', icono: XCircle },
}

function EstadoRev({ estado, motivo }: { estado: EstadoRevision; motivo: string | null }) {
  const e = ESTADO_REV[estado]
  return (
    <span className={cn('flex items-start gap-1 text-[11px] font-semibold', e.clase)}>
      <e.icono className="mt-px h-3 w-3 shrink-0" />
      <span>
        {e.label}
        {estado === 'rechazado' && motivo && <span className="font-normal">: {motivo}</span>}
      </span>
    </span>
  )
}

/** Aprobar / rechazar (con motivo) algo que está por revisar. */
function BotonesRevision({ onRevisar, ocupado, que }: { onRevisar: Revisar; ocupado: boolean; que: string }) {
  const [rechazar, setRechazar] = useState(false)
  const [motivo, setMotivo] = useState('')
  return (
    <>
      <span className="flex gap-1">
        <Button size="sm" variant="outline" className="h-6 px-1.5 text-[11px]" disabled={ocupado} onClick={() => onRevisar(true)} title={`Aprobar ${que}`}>
          <Check className="mr-0.5 h-3 w-3" /> Aprobar
        </Button>
        <Button size="sm" variant="outline" className="h-6 px-1.5 text-[11px] text-destructive" disabled={ocupado} onClick={() => setRechazar(true)} title={`Rechazar ${que}`}>
          <X className="mr-0.5 h-3 w-3" /> Rechazar
        </Button>
      </span>
      <Dialog open={rechazar} onOpenChange={(o) => !o && setRechazar(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar {que}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              if (!motivo.trim()) return
              onRevisar(false, motivo.trim())
              setRechazar(false)
              setMotivo('')
            }}
          >
            <p className="text-sm text-muted-foreground">La empresa recibe un correo con el motivo y lo ve en su portal para corregirlo.</p>
            <div className="space-y-1">
              <Label htmlFor="rev-motivo">Motivo</Label>
              <Textarea id="rev-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRechazar(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={ocupado || !motivo.trim()}>
                Rechazar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Un tipo de documento del mes: sus archivos (con su revisión) y el botón para subir otro. */
export function CeldaDoc({
  titulo,
  archivos,
  puedeSubir,
  puedeBorrar,
  ocupado,
  onSubir,
  onBorrar,
  onRevisar,
}: {
  titulo: string
  archivos: DocEmpresa[]
  puedeSubir: boolean
  puedeBorrar: (d: DocEmpresa) => boolean
  ocupado: boolean
  onSubir: (f: File) => void
  onBorrar: (d: DocEmpresa) => void
  /** solo para quien revisa */
  onRevisar?: (d: DocEmpresa, aprobar: boolean, motivo?: string) => void
}) {
  const aprobado = archivos.some((d) => d.estado === 'aprobado')
  const cargado = archivos.some((d) => d.estado !== 'rechazado')
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-md border p-2.5',
        aprobado ? 'border-success/40 bg-success/5' : cargado ? 'border-border' : 'border-dashed',
      )}
    >
      <p className="flex items-start gap-1.5 text-xs font-semibold">
        {aprobado ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
        ) : cargado ? (
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        )}
        {titulo}
      </p>
      {archivos.map((d) => (
        <div key={d.id} className="space-y-0.5 border-t pt-1.5 first-of-type:border-t-0 first-of-type:pt-0">
          <div className="flex items-center gap-1.5 text-xs">
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
          <EstadoRev estado={d.estado} motivo={d.motivo_rechazo} />
          {onRevisar && d.estado === 'por_revisar' && (
            <BotonesRevision ocupado={ocupado} que={`"${d.nombre}"`} onRevisar={(ap, m) => onRevisar(d, ap, m)} />
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
          <Upload className="h-3 w-3" /> {cargado ? 'Agregar' : 'Subir'}
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

/** El listado de trabajadores del mes: confirmado (con la foto de ese día) y su revisión. */
export function CeldaListado({
  periodo,
  listado,
  activos,
  puedeConfirmar,
  ocupado,
  onConfirmar,
  onRevisar,
}: {
  periodo: string
  listado: Listado | undefined
  /** trabajadores activos hoy (solo lo sabe la propia empresa o Prevención) */
  activos?: number
  puedeConfirmar: boolean
  ocupado: boolean
  onConfirmar: () => void
  /** solo para quien revisa */
  onRevisar?: Revisar
}) {
  const [ver, setVer] = useState(false)
  const aprobado = listado?.estado === 'aprobado'
  const cargado = !!listado && listado.estado !== 'rechazado'
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-md border p-2.5',
        aprobado ? 'border-success/40 bg-success/5' : cargado ? 'border-border' : 'border-dashed',
      )}
    >
      <p className="flex items-start gap-1.5 text-xs font-semibold">
        {aprobado ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
        ) : cargado ? (
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        )}
        Listado de trabajadores
      </p>
      {listado ? (
        <>
          <button type="button" onClick={() => setVer(true)} className="inline-flex w-fit items-center gap-1 text-xs text-brand hover:underline">
            <ListChecks className="h-3.5 w-3.5" />
            {listado.total === 1 ? '1 trabajador' : `${listado.total} trabajadores`} · {fmtFecha(listado.confirmado_at.slice(0, 10))}
          </button>
          <EstadoRev estado={listado.estado} motivo={listado.motivo_rechazo} />
          {onRevisar && listado.estado === 'por_revisar' && <BotonesRevision ocupado={ocupado} que="el listado" onRevisar={onRevisar} />}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sin confirmar{activos !== undefined && ` · ${activos === 1 ? '1 trabajador activo' : `${activos} trabajadores activos`}`}
        </p>
      )}
      {puedeConfirmar && (
        <Button size="sm" variant="outline" className="mt-auto h-7 w-fit px-2 text-[11px]" disabled={ocupado} onClick={onConfirmar}>
          {listado ? 'Volver a confirmar' : 'Confirmar listado'}
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
