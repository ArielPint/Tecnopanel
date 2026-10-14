import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { SUCURSALES } from '@/lib/lineasNegocio'
import { cn } from '@/lib/utils'
import { formatearRut, normalizarRut, rutValido } from '@/modules/sso/lib/rut'
import { hoyChile } from '@/modules/sso/lib/estados'
import { AREAS_SOLICITANTES, JORNADAS, REQUERIMIENTOS, TIPO_CONTRATO, type TipoContrato } from '../lib/catalogos'
import type { DatosIngreso } from '../lib/api'

// Campos de la solicitud, compartidos por Nueva solicitud y Editar (detalle del ingreso).

export function datosVacios(): DatosIngreso {
  return {
    sucursal: '',
    area: '',
    cargo: '',
    fecha_ingreso: '',
    tipo_contrato: 'plazo_fijo',
    jornada: '',
    nombre: '',
    rut: '',
    telefono: null,
    email: null,
    tallas: null,
    req_ti: false,
    req_epp: false,
    req_uniforme: false,
    req_induccion: false,
    req_vehiculo: false,
    observacion: null,
  }
}

/** Mensaje del primer problema, o null si se puede guardar. */
export function validarDatos(d: DatosIngreso, nueva: boolean): string | null {
  const falta = (
    [
      ['área solicitante', d.area],
      ['sucursal', d.sucursal],
      ['cargo', d.cargo],
      ['fecha de ingreso', d.fecha_ingreso],
      ['jornada', d.jornada],
      ['nombre del trabajador', d.nombre],
      ['RUT', d.rut],
    ] as const
  )
    .filter(([, v]) => !v?.trim())
    .map(([k]) => k)
  if (falta.length) return `Falta completar: ${falta.join(', ')}.`
  if (!rutValido(d.rut)) return 'El RUT no es válido. Revisa el dígito verificador.'
  if (nueva && d.fecha_ingreso < hoyChile()) return 'La fecha de ingreso no puede ser anterior a hoy.'
  if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) return 'El correo del trabajador no es válido.'
  return null
}

/** Normaliza antes de enviar: RUT sin puntos y textos vacíos como null. */
export function limpiarDatos(d: DatosIngreso): DatosIngreso {
  const t = (v: string | null) => (v?.trim() ? v.trim() : null)
  return { ...d, rut: normalizarRut(d.rut) ?? d.rut, telefono: t(d.telefono), email: t(d.email), tallas: t(d.tallas), observacion: t(d.observacion) }
}

export function Seccion({ titulo, detalle, children }: { titulo: string; detalle?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-lg border bg-card p-4">
      <legend className="px-1 text-sm font-bold">{titulo}</legend>
      {detalle && <p className="-mt-1 text-xs text-muted-foreground">{detalle}</p>}
      {children}
    </fieldset>
  )
}

const grid = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'
const selectClase = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm'

export default function CamposIngreso({
  datos,
  onChange,
  nueva,
}: {
  datos: DatosIngreso
  onChange: (d: DatosIngreso) => void
  nueva: boolean
}) {
  const set = <K extends keyof DatosIngreso>(k: K, v: DatosIngreso[K]) => onChange({ ...datos, [k]: v })
  const rutMalo = datos.rut.trim().length > 0 && !rutValido(datos.rut)

  return (
    <div className="space-y-4">
      <Seccion titulo="Solicitud">
        <div className={grid}>
          <div className="space-y-1">
            <Label htmlFor="ip-area">Área que solicita</Label>
            <Input id="ip-area" list="ip-areas" value={datos.area} onChange={(e) => set('area', e.target.value)} placeholder="Elige o escribe" />
            <datalist id="ip-areas">
              {AREAS_SOLICITANTES.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ip-sucursal">Sucursal</Label>
            <select id="ip-sucursal" value={datos.sucursal} onChange={(e) => set('sucursal', e.target.value)} className={selectClase}>
              <option value="">Elegir sucursal</option>
              {SUCURSALES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ip-cargo">Cargo</Label>
            <Input id="ip-cargo" value={datos.cargo} onChange={(e) => set('cargo', e.target.value)} placeholder="Ej: Operario línea de paneles" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ip-fecha">Fecha de ingreso</Label>
            <Input id="ip-fecha" type="date" min={nueva ? hoyChile() : undefined} value={datos.fecha_ingreso} onChange={(e) => set('fecha_ingreso', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ip-contrato">Tipo de contrato</Label>
            <select
              id="ip-contrato"
              value={datos.tipo_contrato}
              onChange={(e) => set('tipo_contrato', e.target.value as TipoContrato)}
              className={selectClase}
            >
              {Object.entries(TIPO_CONTRATO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ip-jornada">Jornada</Label>
            <Input id="ip-jornada" list="ip-jornadas" value={datos.jornada} onChange={(e) => set('jornada', e.target.value)} placeholder="Elige o escribe" />
            <datalist id="ip-jornadas">
              {JORNADAS.map((j) => (
                <option key={j} value={j} />
              ))}
            </datalist>
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Trabajador">
        <div className={grid}>
          <div className="space-y-1">
            <Label htmlFor="ip-nombre">Nombre completo</Label>
            <Input id="ip-nombre" autoComplete="off" value={datos.nombre} onChange={(e) => set('nombre', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ip-rut">RUT</Label>
            <Input
              id="ip-rut"
              value={datos.rut}
              onChange={(e) => set('rut', e.target.value)}
              onBlur={() => rutValido(datos.rut) && set('rut', formatearRut(datos.rut))}
              placeholder="12.345.678-5"
              className={cn('font-mono-tabular', rutMalo && 'border-destructive')}
              aria-invalid={rutMalo}
            />
            {rutMalo && <p className="text-xs text-destructive">RUT no válido. Revisa el dígito verificador.</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="ip-tel">Teléfono</Label>
            <Input id="ip-tel" type="tel" value={datos.telefono ?? ''} onChange={(e) => set('telefono', e.target.value)} placeholder="+56 9 ..." />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ip-mail">Correo personal</Label>
            <Input id="ip-mail" type="email" value={datos.email ?? ''} onChange={(e) => set('email', e.target.value)} />
          </div>
        </div>
      </Seccion>

      <Seccion titulo="¿Qué necesita para empezar?" detalle="Cada opción crea una tarea para el área que la hace. El contrato firmado lo gestiona RRHH siempre.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {REQUERIMIENTOS.map((r) => (
            <label
              key={r.key}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-md border p-3 text-sm transition-colors',
                datos[r.key] ? 'border-brand bg-brand/5' : 'hover:bg-accent/50',
              )}
            >
              <input type="checkbox" checked={datos[r.key]} onChange={(e) => set(r.key, e.target.checked)} className="mt-0.5 accent-[hsl(var(--brand))]" />
              <span>
                <span className="block font-semibold">{r.titulo}</span>
                <span className="block text-xs text-muted-foreground">{r.detalle}</span>
                <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Lo hace: {r.area}</span>
              </span>
            </label>
          ))}
        </div>
        {(datos.req_epp || datos.req_uniforme) && (
          <div className="space-y-1">
            <Label htmlFor="ip-tallas">Tallas</Label>
            <Input id="ip-tallas" value={datos.tallas ?? ''} onChange={(e) => set('tallas', e.target.value)} placeholder="Zapato 42 · Polera L · Pantalón 44" />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="ip-obs">Observaciones</Label>
          <Textarea id="ip-obs" rows={2} value={datos.observacion ?? ''} onChange={(e) => set('observacion', e.target.value)} placeholder="Reemplazo de…, horario especial, etc." />
        </div>
      </Seccion>
    </div>
  )
}
