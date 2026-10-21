import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatearRut, rutValido } from '@/modules/sso/lib/rut'
import { MesEmpresa, TablaEstadosPago, useAccion } from '../components/ValidacionContratista'
import { usePermisosIngreso } from '../hooks/usePermisosIngreso'
import { DIA_LIMITE_EMPRESA } from '../lib/catalogos'
import { ESTADO_MES, nombreMes, periodoDe, situacionMes, type EstadoMes } from '../lib/contratistas'
import {
  guardarEmpresa,
  listarDocsEmpresas,
  listarEmpresas,
  listarEstadosPagoEmpresas,
  listarListados,
  type DocEmpresa,
  type Empresa,
  type EstadoPagoEmpresa,
  type Listado,
} from '../lib/api'
import { RUTA } from '../lib/rutas'

const msg = (err: unknown, porDefecto: string) => (err instanceof Error ? err.message : porDefecto)

type EmpresaForm = { id?: string; nombre: string; rut: string; email: string; telefono: string; activa: boolean }

const ORDEN: Record<EstadoMes, number> = { atrasado: 0, en_revision: 1, pendiente: 2, al_dia: 3 }

/** Contratistas (personal de Tecnopanel): aquí se valida lo que sube cada empresa desde su portal
 *  (/contratistas): la documentación del mes, el listado de trabajadores y los estados de pago. */
export default function Contratistas() {
  const { tiene, validaEp } = usePermisosIngreso()
  const administra = tiene('rrhh') || tiene('prevencion')
  const [periodo, setPeriodo] = useState(periodoDe)
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [docs, setDocs] = useState<DocEmpresa[]>([])
  const [listados, setListados] = useState<Listado[]>([])
  const [eps, setEps] = useState<EstadoPagoEmpresa[]>([])
  const [loading, setLoading] = useState(true)
  const [verInactivas, setVerInactivas] = useState(false)
  const [filtro, setFiltro] = useState<EstadoMes | 'todas'>('todas')
  const [texto, setTexto] = useState('')
  const [form, setForm] = useState<EmpresaForm | null>(null)

  const cargar = useCallback(async () => {
    try {
      const [e, d, l, ep] = await Promise.all([
        listarEmpresas(),
        listarDocsEmpresas(periodo),
        listarListados(periodo),
        validaEp ? listarEstadosPagoEmpresas() : Promise.resolve([]),
      ])
      setEmpresas(e)
      setDocs(d)
      setListados(l)
      setEps(ep)
    } catch (err) {
      toast.error(msg(err, 'Error al cargar'))
    } finally {
      setLoading(false)
    }
  }, [periodo, validaEp])

  useEffect(() => {
    cargar()
  }, [cargar])

  const { ocupado, hacer } = useAccion(cargar)
  const situaciones = useMemo(
    () => Object.fromEntries(empresas.map((e) => [e.id, situacionMes(e.id, docs, listados, periodo)])),
    [empresas, docs, listados, periodo],
  )
  const nombre = useMemo(() => {
    const m = new Map(empresas.map((e) => [e.id, e.nombre]))
    return (id: string) => m.get(id) ?? '—'
  }, [empresas])
  const epsPendientes = eps.filter((e) => e.estado === 'emitido' || e.estado === 'en_revision' || e.estado === 'aprobado')
  const activas = empresas.filter((e) => e.activa)
  const cuenta = (k: EstadoMes) => activas.filter((e) => situaciones[e.id]?.estado === k).length
  const q = texto.trim().toLowerCase()
  const qRut = q.replace(/[^0-9k]/g, '')
  const visibles = empresas
    .filter((e) => verInactivas || e.activa)
    .filter((e) => filtro === 'todas' || situaciones[e.id]?.estado === filtro)
    .filter((e) => !q || e.nombre.toLowerCase().includes(q) || (qRut.length >= 4 && (e.rut ?? '').toLowerCase().replace('-', '').includes(qRut)))
    .sort((a, b) => ORDEN[situaciones[a.id].estado] - ORDEN[situaciones[b.id].estado] || a.nombre.localeCompare(b.nombre))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold">Contratistas</h1>
          <p className="text-sm text-muted-foreground">
            Cada empresa sube su documentación, confirma su listado y emite sus estados de pago en su portal (/contratistas). Aquí se revisa y se
            valida. Plazo de la documentación: día {DIA_LIMITE_EMPRESA} del mes.
          </p>
        </div>
        {administra && (
          <Button size="sm" onClick={() => setForm({ nombre: '', rut: '', email: '', telefono: '', activa: true })}>
            Agregar empresa
          </Button>
        )}
      </div>

      {validaEp && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">
            Estados de pago por validar <span className="font-normal text-muted-foreground">({epsPendientes.length})</span>
          </h2>
          {loading ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : epsPendientes.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No hay estados de pago emitidos, en revisión ni por pagar.</p>
          ) : (
            <TablaEstadosPago eps={epsPendientes} nombreEmpresa={nombre} recargar={cargar} />
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-1 text-sm font-bold">Documentación de {nombreMes(periodo)}</h2>
          <Input
            type="month"
            value={periodo.slice(0, 7)}
            onChange={(e) => e.target.value && setPeriodo(`${e.target.value}-01`)}
            className="h-8 w-40"
            aria-label="Mes"
          />
        </div>
        {!loading && activas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {(['todas', 'atrasado', 'en_revision', 'pendiente', 'al_dia'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFiltro(k)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                  filtro === k ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {k === 'todas' ? 'Todas' : ESTADO_MES[k].label} <span className="tabular-nums opacity-70">{k === 'todas' ? activas.length : cuenta(k)}</span>
              </button>
            ))}
            <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar empresa o RUT" className="ml-auto h-9 w-full sm:w-60" />
          </div>
        )}

        {loading ? (
          <div className="h-40 animate-pulse rounded bg-muted" />
        ) : empresas.length === 0 ? (
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Todavía no hay empresas contratistas. Son las mismas de Estados de Pago
            {administra ? '; también puedes agregarlas aquí con "Agregar empresa".' : '.'}
          </p>
        ) : (
          <div className="space-y-3">
            {visibles.map((e) => {
              const s = situaciones[e.id]
              const epsEmpresa = epsPendientes.filter((x) => x.empresa_id === e.id).length
              return (
                <Card key={e.id} className={cn(!e.activa && 'opacity-70')}>
                  <CardContent className="space-y-3 pt-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={RUTA.contratista(e.id)} className="font-bold hover:underline">
                            {e.nombre}
                          </Link>
                          {e.activa ? (
                            <Badge variant={ESTADO_MES[s.estado].variant}>{ESTADO_MES[s.estado].label}</Badge>
                          ) : (
                            <Badge variant="secondary">Inactiva</Badge>
                          )}
                          {epsEmpresa > 0 && <Badge variant="default">{epsEmpresa === 1 ? '1 EP por validar' : `${epsEmpresa} EP por validar`}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {[
                            e.rut && formatearRut(e.rut),
                            s.porCargar.length ? `Falta: ${s.porCargar.join(', ')}` : null,
                            s.porRevisar.length ? `Por revisar: ${s.porRevisar.join(', ')}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {administra && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8"
                            aria-label={`Editar ${e.nombre}`}
                            disabled={ocupado}
                            onClick={() =>
                              setForm({ id: e.id, nombre: e.nombre, rut: e.rut ? formatearRut(e.rut) : '', email: e.email ?? '', telefono: e.telefono ?? '', activa: e.activa })
                            }
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                          <Link to={RUTA.contratista(e.id)}>
                            Ficha <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                    <MesEmpresa
                      empresa={e}
                      periodo={periodo}
                      docs={docs.filter((d) => d.empresa_id === e.id)}
                      listado={listados.find((l) => l.empresa_id === e.id)}
                      recargar={cargar}
                    />
                  </CardContent>
                </Card>
              )
            })}
            {visibles.length === 0 && <p className="text-sm text-muted-foreground">No hay empresas con este filtro.</p>}
            {empresas.some((e) => !e.activa) && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} className="accent-[hsl(var(--brand))]" />
                Mostrar empresas inactivas
              </label>
            )}
          </div>
        )}
      </section>

      {form && (
        <DialogoEmpresa
          inicial={form}
          ocupado={ocupado}
          onCerrar={() => setForm(null)}
          onGuardar={async (f) => {
            const datos = {
              id: f.id,
              nombre: f.nombre.trim(),
              rut: f.rut.trim() || null,
              email: f.email.trim() || null,
              telefono: f.telefono.trim() || null,
              activa: f.activa,
            }
            if (await hacer(() => guardarEmpresa(datos), f.id ? 'Empresa guardada' : 'Empresa agregada')) setForm(null)
          }}
        />
      )}
    </div>
  )
}

export function DialogoEmpresa({
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
          <p className="text-xs text-muted-foreground">
            Es la misma lista de Estados de Pago y de Prevención. Las cuentas para que la empresa entre a su portal se crean en Usuarios (pestaña
            Cuenta, &quot;Portal de subcontratista&quot;).
          </p>
          <div className="space-y-1">
            <Label htmlFor="ct-nombre">Nombre o razón social</Label>
            <Input id="ct-nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ct-rut">RUT</Label>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ct-email">Correo de contacto</Label>
              <Input id="ct-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ct-tel">Teléfono</Label>
              <Input id="ct-tel" type="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
            </div>
          </div>
          {inicial.id && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.activa} onChange={(e) => setF({ ...f, activa: e.target.checked })} className="accent-[hsl(var(--brand))]" />
              Activa (una inactiva no aparece al pedir ingresos ni cuenta en el control del mes)
            </label>
          )}
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
