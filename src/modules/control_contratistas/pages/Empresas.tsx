import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/modules/financiero/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatearRut, rutValido } from '@/modules/sso/lib/rut'
import { useAccion } from '../components/ValidacionContratista'
import { usePermisosContratistas } from '../hooks/usePermisosContratistas'
import { ESTADO_MES, epPorValidar, nombreMes, periodoDe, situacionMes } from '../lib/contratistas'
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

/** Directorio de empresas contratistas: contacto, cómo van este mes y acceso a su ficha.
 *  Quien administra empresas las agrega y corrige aquí. */
export default function Empresas() {
  const { tiene, validaEp } = usePermisosContratistas()
  const administra = tiene('administrador')
  const periodo = periodoDe()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [docs, setDocs] = useState<DocEmpresa[]>([])
  const [listados, setListados] = useState<Listado[]>([])
  const [eps, setEps] = useState<EstadoPagoEmpresa[]>([])
  const [loading, setLoading] = useState(true)
  const [verInactivas, setVerInactivas] = useState(false)
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
  const q = texto.trim().toLowerCase()
  const qRut = q.replace(/[^0-9k]/g, '')
  const visibles = empresas
    .filter((e) => verInactivas || e.activa)
    .filter((e) => !q || e.nombre.toLowerCase().includes(q) || (qRut.length >= 4 && (e.rut ?? '').toLowerCase().replace('-', '').includes(qRut)))
    .sort((a, b) => Number(b.activa) - Number(a.activa) || a.nombre.localeCompare(b.nombre))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold">Empresas</h1>
          <p className="text-sm text-muted-foreground">
            Las empresas contratistas (la misma lista de Estados de Pago). Abre una para ver su ficha: documentación, estados de pago, trabajadores e ingresos.
          </p>
        </div>
        {administra && (
          <Button size="sm" onClick={() => setForm({ nombre: '', rut: '', email: '', telefono: '', activa: true })}>
            Agregar empresa
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar empresa o RUT" className="h-9 w-full sm:w-60" />
        {empresas.some((e) => !e.activa) && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} className="accent-[hsl(var(--brand))]" />
            Mostrar inactivas
          </label>
        )}
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded bg-muted" />
      ) : empresas.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Todavía no hay empresas contratistas. Son las mismas de Estados de Pago
          {administra ? '; también puedes agregarlas aquí con "Agregar empresa".' : '.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Empresa</th>
                <th className="px-3 py-2 font-semibold">Contacto</th>
                <th className="px-3 py-2 font-semibold">Documentación de {nombreMes(periodo)}</th>
                {validaEp && <th className="px-3 py-2 font-semibold">EP por validar</th>}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((e) => {
                const s = situaciones[e.id]
                const epsEmpresa = eps.filter((x) => x.empresa_id === e.id && epPorValidar(x.estado)).length
                return (
                  <tr key={e.id} className={cn('border-b last:border-0', !e.activa && 'opacity-70')}>
                    <td className="px-3 py-2">
                      <Link to={RUTA.contratista(e.id)} className="font-semibold hover:underline">
                        {e.nombre}
                      </Link>
                      {e.rut && <p className="font-mono-tabular text-xs text-muted-foreground">{formatearRut(e.rut)}</p>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{[e.email, e.telefono].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-3 py-2">
                      {e.activa ? (
                        <Badge variant={ESTADO_MES[s.estado].variant}>{ESTADO_MES[s.estado].label}</Badge>
                      ) : (
                        <Badge variant="secondary">Inactiva</Badge>
                      )}
                    </td>
                    {validaEp && <td className="px-3 py-2 tabular-nums">{epsEmpresa || '—'}</td>}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {administra && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8"
                            aria-label={`Editar ${e.nombre}`}
                            disabled={ocupado}
                            onClick={() =>
                              setForm({
                                id: e.id,
                                nombre: e.nombre,
                                rut: e.rut ? formatearRut(e.rut) : '',
                                email: e.email ?? '',
                                telefono: e.telefono ?? '',
                                activa: e.activa,
                              })
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
                    </td>
                  </tr>
                )
              })}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={validaEp ? 5 : 4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No hay empresas con esta búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

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
          <p className="text-xs text-muted-foreground">
            Es la misma lista de Estados de Pago y de Prevención. Las cuentas para que la empresa entre a su portal se crean en Usuarios (pestaña Cuenta,
            &quot;Portal de subcontratista&quot;).
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
