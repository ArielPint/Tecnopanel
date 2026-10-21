import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, Circle, FileText, Pencil, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatearRut, rutValido } from '@/modules/sso/lib/rut'
import { fmtFecha } from '@/modules/sso/lib/estados'
import { usePermisosIngreso } from '../hooks/usePermisosIngreso'
import { DIA_LIMITE_EMPRESA, DOCS_EMPRESA, type TipoDocEmpresa } from '../lib/catalogos'
import { ESTADO_MES, estadoMes, faltantes, nombreMes, periodoDe } from '../lib/contratistas'
import {
  ARCHIVOS_ACEPTADOS,
  abrirArchivo,
  eliminarDocEmpresa,
  eliminarEmpresa,
  guardarEmpresa,
  listarDocsEmpresas,
  listarEmpresas,
  listarIngresos,
  subirDocEmpresa,
  type DocEmpresa,
  type Empresa,
} from '../lib/api'

const msg = (err: unknown, porDefecto: string) => (err instanceof Error ? err.message : porDefecto)

type EmpresaForm = { id?: string; nombre: string; rut: string; contacto: string }

/** Empresas contratistas y su documentación mensual (RRHH, Prevención y coordinadores). */
export default function Contratistas() {
  const { tiene, userId } = usePermisosIngreso()
  const administra = tiene('rrhh') || tiene('prevencion')
  const [periodo, setPeriodo] = useState(periodoDe)
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [docs, setDocs] = useState<DocEmpresa[]>([])
  const [trabajadores, setTrabajadores] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [verInactivas, setVerInactivas] = useState(false)
  const [form, setForm] = useState<EmpresaForm | null>(null)

  const cargar = useCallback(async () => {
    try {
      const [e, d, ingresos] = await Promise.all([listarEmpresas(), listarDocsEmpresas(periodo), listarIngresos()])
      setEmpresas(e)
      setDocs(d)
      const conteo: Record<string, number> = {}
      for (const i of ingresos) if (i.empresa_id && i.estado !== 'anulado') conteo[i.empresa_id] = (conteo[i.empresa_id] ?? 0) + 1
      setTrabajadores(conteo)
    } catch (err) {
      toast.error(msg(err, 'Error al cargar'))
    } finally {
      setLoading(false)
    }
  }, [periodo])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function hacer(accion: () => Promise<void>, exito: string) {
    setOcupado(true)
    try {
      await accion()
      toast.success(exito)
      await cargar()
      return true
    } catch (err) {
      toast.error(msg(err, 'No se pudo completar la acción'))
      return false
    } finally {
      setOcupado(false)
    }
  }

  const visibles = useMemo(() => empresas.filter((e) => verInactivas || e.activa), [empresas, verInactivas])
  const estados = useMemo(
    () => Object.fromEntries(empresas.map((e) => [e.id, estadoMes(faltantes(e.id, docs).length, periodo)])),
    [empresas, docs, periodo],
  )
  const activas = empresas.filter((e) => e.activa)
  const cuenta = (k: keyof typeof ESTADO_MES) => activas.filter((e) => estados[e.id] === k).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">Contratistas</h1>
          <p className="text-sm text-muted-foreground">
            Cada empresa envía todos los meses su documentación. Hasta el día {DIA_LIMITE_EMPRESA} queda pendiente; después, atrasada.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="ct-mes" className="text-sm">
            Mes
          </Label>
          <Input
            id="ct-mes"
            type="month"
            value={periodo.slice(0, 7)}
            onChange={(e) => e.target.value && setPeriodo(`${e.target.value}-01`)}
            className="h-9 w-40"
          />
          {administra && (
            <Button size="sm" onClick={() => setForm({ nombre: '', rut: '', contacto: '' })}>
              Agregar empresa
            </Button>
          )}
        </div>
      </div>

      {!loading && activas.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {(Object.keys(ESTADO_MES) as (keyof typeof ESTADO_MES)[]).map((k) => (
            <Badge key={k} variant={ESTADO_MES[k].variant}>
              {ESTADO_MES[k].label}: {cuenta(k)}
            </Badge>
          ))}
          <span className="text-muted-foreground">en {nombreMes(periodo)}</span>
        </div>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded bg-muted" />
      ) : empresas.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Todavía no hay empresas contratistas.{administra ? ' Agrégalas con "Agregar empresa".' : ' Las agregan RRHH o Prevención.'}
        </p>
      ) : (
        <div className="space-y-3">
          {visibles.map((e) => {
            const estado = estados[e.id]
            const n = trabajadores[e.id] ?? 0
            return (
              <Card key={e.id} className={cn(!e.activa && 'opacity-70')}>
                <CardContent className="space-y-3 pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold">{e.nombre}</h2>
                        {e.activa ? (
                          <Badge variant={ESTADO_MES[estado].variant}>{ESTADO_MES[estado].label}</Badge>
                        ) : (
                          <Badge variant="secondary">Inactiva</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[e.rut && formatearRut(e.rut), e.contacto, n === 0 ? 'sin ingresos' : n === 1 ? '1 ingreso' : `${n} ingresos`]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    {administra && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          aria-label={`Editar ${e.nombre}`}
                          onClick={() => setForm({ id: e.id, nombre: e.nombre, rut: e.rut ? formatearRut(e.rut) : '', contacto: e.contacto ?? '' })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          disabled={ocupado}
                          onClick={() => hacer(() => guardarEmpresa({ ...e, activa: !e.activa }), e.activa ? 'Empresa desactivada' : 'Empresa activada')}
                        >
                          {e.activa ? 'Desactivar' : 'Activar'}
                        </Button>
                        {n === 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-muted-foreground hover:text-destructive"
                            disabled={ocupado}
                            aria-label={`Eliminar ${e.nombre}`}
                            onClick={() => window.confirm(`¿Eliminar "${e.nombre}" y sus documentos?`) && hacer(() => eliminarEmpresa(e.id), 'Empresa eliminada')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {DOCS_EMPRESA.map((t) => (
                      <CeldaDoc
                        key={t.key}
                        titulo={t.label}
                        archivos={docs.filter((d) => d.empresa_id === e.id && d.tipo === t.key)}
                        puedeSubir={e.activa}
                        puedeBorrar={(d) => tiene('rrhh') || d.subido_por === userId}
                        ocupado={ocupado}
                        onSubir={(f) => hacer(() => subirDocEmpresa(e.id, periodo, t.key as TipoDocEmpresa, f), 'Documento cargado')}
                        onBorrar={(d) => window.confirm(`¿Eliminar "${d.nombre}"?`) && hacer(() => eliminarDocEmpresa(d), 'Documento eliminado')}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {empresas.some((e) => !e.activa) && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} className="accent-[hsl(var(--brand))]" />
              Mostrar empresas inactivas
            </label>
          )}
        </div>
      )}

      {form && (
        <DialogoEmpresa
          inicial={form}
          ocupado={ocupado}
          onCerrar={() => setForm(null)}
          onGuardar={async (f) => {
            const datos = { id: f.id, nombre: f.nombre.trim(), rut: f.rut.trim() || null, contacto: f.contacto.trim() || null }
            if (await hacer(() => guardarEmpresa(datos), f.id ? 'Empresa guardada' : 'Empresa agregada')) setForm(null)
          }}
        />
      )}
    </div>
  )
}

function CeldaDoc({
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

function DialogoEmpresa({
  inicial,
  ocupado,
  onCerrar,
  onGuardar,
}: {
  inicial: EmpresaForm
  ocupado: boolean
  onCerrar: () => void
  onGuardar: (f: EmpresaForm) => void
}) {
  const [f, setF] = useState(inicial)
  const rutMalo = f.rut.trim().length > 0 && !rutValido(f.rut)

  function enviar(e: FormEvent) {
    e.preventDefault()
    if (!f.nombre.trim() || rutMalo) return
    onGuardar(f)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{inicial.id ? 'Editar empresa' : 'Agregar empresa contratista'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={enviar} noValidate className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ct-nombre">Nombre o razón social</Label>
            <Input id="ct-nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ct-rut">RUT (opcional)</Label>
            <Input
              id="ct-rut"
              value={f.rut}
              onChange={(e) => setF({ ...f, rut: e.target.value })}
              onBlur={() => rutValido(f.rut) && setF({ ...f, rut: formatearRut(f.rut) })}
              placeholder="76.123.456-7"
              className={cn('font-mono-tabular', rutMalo && 'border-destructive')}
              aria-invalid={rutMalo}
            />
            {rutMalo && <p className="text-xs text-destructive">RUT no válido. Revisa el dígito verificador.</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="ct-contacto">Contacto (opcional)</Label>
            <Input
              id="ct-contacto"
              value={f.contacto}
              onChange={(e) => setF({ ...f, contacto: e.target.value })}
              placeholder="Quién envía los documentos: nombre, teléfono o correo"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={ocupado || !f.nombre.trim() || rutMalo}>
              {ocupado ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
