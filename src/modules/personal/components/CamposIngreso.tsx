import { AlertTriangle } from 'lucide-react'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Textarea } from '@/modules/financiero/components/ui/textarea'
import { SUCURSALES } from '@/lib/lineasNegocio'
import { cn } from '@/lib/utils'
import { formatearRut, normalizarRut, rutValido } from '@/modules/sso/lib/rut'
import { fmtFecha, hoyChile } from '@/modules/sso/lib/estados'
import {
  DIAS_AVISO,
  ITEMS_TI,
  LICENCIAS,
  LICENCIAS_TI,
  PORTALES_TI,
  MOTIVOS,
  REQUERIMIENTOS,
  TALLAS,
  TAREAS_SIEMPRE,
  TIPO_CONTRATO,
  TIPO_TRABAJADOR,
  type CampoTalla,
  type Motivo,
  type TipoContrato,
  type TipoTrabajador,
} from '../lib/catalogos'
import { fechaMinimaAviso } from '../lib/plazos'
import type { Area, DatosIngreso, Jornada } from '../lib/api'
import type { Empresa } from '@/modules/control_contratistas/lib/api'

// Campos de la solicitud, compartidos por Nueva solicitud y Editar (detalle del ingreso).

export function datosVacios(): DatosIngreso {
  return {
    sucursal: '',
    area: '',
    cargo: '',
    tipo_trabajador: 'planta',
    empresa_id: null,
    motivo: null,
    reemplaza_a: null,
    jefatura_directa: null,
    fecha_ingreso: '',
    tipo_contrato: 'plazo_fijo',
    jornada: '',
    horario: null,
    nombre: '',
    rut: '',
    telefono: null,
    email: null,
    req_ti: false,
    ti_correo: false,
    ti_notebook: false,
    ti_pantalla: false,
    ti_licencias: [],
    ti_portales: [],
    ti_otros: null,
    req_epp: false,
    req_uniforme: false,
    talla_zapato: null,
    talla_polera: null,
    talla_pantalon: null,
    talla_chaqueta: null,
    tallas: null,
    req_vehiculo: false,
    licencia_requerida: null,
    observacion: null,
  }
}

/** Solo los campos de DatosIngreso (para editar un ingreso, que trae además los de la vista). */
export function datosDe(origen: DatosIngreso): DatosIngreso {
  const base = datosVacios()
  const d = Object.fromEntries(Object.keys(base).map((k) => [k, origen[k as keyof DatosIngreso] ?? base[k as keyof DatosIngreso]]))
  return { ...(d as unknown as DatosIngreso), rut: formatearRut(origen.rut) }
}

const vacio = (v: string | null | undefined) => !v?.trim()

/** Mensaje del primer problema, o null si se puede guardar. */
export function validarDatos(d: DatosIngreso, nueva: boolean): string | null {
  const falta = (
    [
      ['área solicitante', d.area],
      ['sucursal', d.sucursal],
      ['motivo de la contratación', d.motivo],
      ['a quién reemplaza', d.motivo === 'reemplazo' ? d.reemplaza_a : 'no aplica'],
      ['jefatura directa', d.jefatura_directa],
      ['cargo', d.cargo],
      ['empresa contratista', d.tipo_trabajador === 'contratista' ? d.empresa_id : 'no aplica'],
      ['fecha de ingreso', d.fecha_ingreso],
      ['jornada', d.jornada],
      ['horario', d.horario],
      ['nombre del trabajador', d.nombre],
      ['RUT', d.rut],
    ] as const
  )
    .filter(([, v]) => vacio(v))
    .map(([k]) => k)
  if (falta.length) return `Falta completar: ${falta.join(', ')}.`
  if (!rutValido(d.rut)) return 'El RUT no es válido. Revisa el dígito verificador.'
  if (nueva && d.fecha_ingreso < hoyChile()) return 'La fecha de ingreso no puede ser anterior a hoy.'
  if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) return 'El correo del trabajador no es válido.'
  if (d.req_ti && !d.ti_correo && !d.ti_notebook && !d.ti_pantalla && !d.ti_licencias.length && !d.ti_portales.length && vacio(d.ti_otros))
    return 'Indica qué necesita de TI: equipo, licencias, portales u otros.'
  const tallas = (Object.keys(TALLAS) as CampoTalla[]).filter((k) => pideTalla(d, k) && vacio(d[k]))
  if (tallas.length) return `Falta la talla de: ${tallas.map((k) => TALLAS[k].label.toLowerCase()).join(', ')}.`
  if (d.req_vehiculo && vacio(d.licencia_requerida)) return 'Indica la licencia o certificación que pide la conducción.'
  return null
}

/** Zapato si pide EPP; polera, pantalón y polar si pide uniforme. */
function pideTalla(d: DatosIngreso, k: CampoTalla): boolean {
  return TALLAS[k].para === 'epp' ? d.req_epp : d.req_uniforme
}

/** Normaliza antes de enviar: RUT sin puntos, textos vacíos como null y nada de lo que no se pidió. */
export function limpiarDatos(d: DatosIngreso): DatosIngreso {
  const t = (v: string | null) => (v?.trim() ? v.trim() : null)
  const talla = (k: CampoTalla) => (pideTalla(d, k) ? t(d[k]) : null)
  return {
    ...d,
    rut: normalizarRut(d.rut) ?? d.rut,
    empresa_id: d.tipo_trabajador === 'contratista' ? d.empresa_id : null,
    reemplaza_a: d.motivo === 'reemplazo' ? t(d.reemplaza_a) : null,
    jefatura_directa: t(d.jefatura_directa),
    horario: t(d.horario),
    telefono: t(d.telefono),
    email: t(d.email),
    ti_correo: d.req_ti && d.ti_correo,
    ti_notebook: d.req_ti && d.ti_notebook,
    ti_pantalla: d.req_ti && d.ti_pantalla,
    ti_licencias: d.req_ti ? d.ti_licencias : [],
    ti_portales: d.req_ti ? d.ti_portales : [],
    ti_otros: d.req_ti ? t(d.ti_otros) : null,
    talla_zapato: talla('talla_zapato'),
    talla_polera: talla('talla_polera'),
    talla_pantalon: talla('talla_pantalon'),
    talla_chaqueta: talla('talla_chaqueta'),
    tallas: d.req_epp || d.req_uniforme ? t(d.tallas) : null,
    licencia_requerida: d.req_vehiculo ? t(d.licencia_requerida) : null,
    observacion: t(d.observacion),
  }
}

function GrupoTi({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">{children}</div>
    </div>
  )
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
  areas,
  jornadas,
  empresas,
  solicitante,
}: {
  datos: DatosIngreso
  onChange: (d: DatosIngreso) => void
  nueva: boolean
  /** Configuración > Áreas. Se ofrecen las activas, más la que ya tiene la solicitud si se desactivó. */
  areas: Area[]
  /** Configuración > Jornadas. Al elegir una se copia su horario, que se puede ajustar. */
  jornadas: Jornada[]
  /** Contratistas > Empresas. Se ofrecen las activas, más la que ya tiene la solicitud si se desactivó. */
  empresas: Empresa[]
  /** Quien completa el formulario (en una solicitud nueva, la persona conectada) */
  solicitante: string | null
}) {
  const set = <K extends keyof DatosIngreso>(k: K, v: DatosIngreso[K]) => onChange({ ...datos, [k]: v })
  const alternar = (k: 'ti_licencias' | 'ti_portales', valor: string, si: boolean) =>
    set(k, si ? [...datos[k].filter((x) => x !== valor), valor] : datos[k].filter((x) => x !== valor))
  const opcionesArea = areas.filter((a) => a.activa).map((a) => a.nombre)
  const opcionesEmpresa = empresas.filter((e) => e.activa || e.id === datos.empresa_id)
  if (datos.area && !opcionesArea.includes(datos.area)) opcionesArea.push(datos.area)
  const rutMalo = datos.rut.trim().length > 0 && !rutValido(datos.rut)
  // El aviso se mide desde el día en que se pide: solo tiene sentido al crearla
  const minimaAviso = nueva ? fechaMinimaAviso(hoyChile()) : null
  const pocoAviso = !!minimaAviso && !!datos.fecha_ingreso && datos.fecha_ingreso >= hoyChile() && datos.fecha_ingreso < minimaAviso

  function elegirJornada(nombre: string) {
    // una jornada configurada trae su horario; si se escribe otra, el horario queda como estaba
    const j = jornadas.find((x) => x.nombre.toLowerCase() === nombre.trim().toLowerCase())
    onChange({ ...datos, jornada: nombre, horario: j?.horario ?? datos.horario })
  }

  const tallasVisibles = (Object.keys(TALLAS) as CampoTalla[]).filter((k) => pideTalla(datos, k))
  const siempre = TAREAS_SIEMPRE.filter((t) => !t.soloPlanta || datos.tipo_trabajador === 'planta')

  return (
    <div className="space-y-4">
      <Seccion titulo="Solicitud">
        <div className={grid}>
          <div className="space-y-1">
            <Label htmlFor="ip-area">Área que solicita</Label>
            <select id="ip-area" value={datos.area} onChange={(e) => set('area', e.target.value)} className={selectClase}>
              <option value="">Elegir área</option>
              {opcionesArea.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Completa el formulario</Label>
            <p className="flex h-9 items-center truncate rounded-md border border-dashed bg-muted/40 px-3 text-sm">{solicitante ?? '—'}</p>
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
            <Label htmlFor="ip-motivo">Motivo de la contratación</Label>
            <select
              id="ip-motivo"
              value={datos.motivo ?? ''}
              onChange={(e) => set('motivo', (e.target.value || null) as Motivo | null)}
              className={selectClase}
            >
              <option value="">Elegir motivo</option>
              {Object.entries(MOTIVOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {datos.motivo === 'reemplazo' && (
            <div className="space-y-1">
              <Label htmlFor="ip-reemplaza">Reemplaza a</Label>
              <Input
                id="ip-reemplaza"
                value={datos.reemplaza_a ?? ''}
                onChange={(e) => set('reemplaza_a', e.target.value)}
                placeholder="Nombre de la persona que reemplaza"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="ip-jefatura">Jefatura directa</Label>
            <Input
              id="ip-jefatura"
              value={datos.jefatura_directa ?? ''}
              onChange={(e) => set('jefatura_directa', e.target.value)}
              placeholder="Quién será su jefe directo"
            />
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Cargo y jornada">
        <div className={grid}>
          <div className="space-y-1">
            <Label htmlFor="ip-cargo">Cargo</Label>
            <Input id="ip-cargo" value={datos.cargo} onChange={(e) => set('cargo', e.target.value)} placeholder="Ej: Operario línea de paneles" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ip-tipo">Tipo de trabajador</Label>
            <select
              id="ip-tipo"
              value={datos.tipo_trabajador}
              onChange={(e) => set('tipo_trabajador', e.target.value as TipoTrabajador)}
              className={selectClase}
            >
              {Object.entries(TIPO_TRABAJADOR).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {datos.tipo_trabajador === 'contratista' && (
            <div className="space-y-1">
              <Label htmlFor="ip-empresa">Empresa contratista</Label>
              <select id="ip-empresa" value={datos.empresa_id ?? ''} onChange={(e) => set('empresa_id', e.target.value || null)} className={selectClase}>
                <option value="">Elegir empresa</option>
                {opcionesEmpresa.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
              {opcionesEmpresa.length === 0 && (
                <p className="text-xs text-muted-foreground">No hay empresas contratistas registradas: pide a Prevención o RRHH que la agreguen.</p>
              )}
            </div>
          )}
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
            <Label htmlFor="ip-fecha">Fecha de ingreso</Label>
            <Input
              id="ip-fecha"
              type="date"
              min={nueva ? hoyChile() : undefined}
              value={datos.fecha_ingreso}
              onChange={(e) => set('fecha_ingreso', e.target.value)}
              className={cn(pocoAviso && 'border-warning')}
            />
            {minimaAviso && !pocoAviso && (
              <p className="text-xs text-muted-foreground">
                Con {DIAS_AVISO} días hábiles de aviso: desde el {fmtFecha(minimaAviso)}.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="ip-jornada">Jornada</Label>
            <Input id="ip-jornada" list="ip-jornadas" value={datos.jornada} onChange={(e) => elegirJornada(e.target.value)} placeholder="Elige o escribe" />
            <datalist id="ip-jornadas">
              {jornadas
                .filter((j) => j.activa)
                .map((j) => (
                  <option key={j.id} value={j.nombre}>
                    {j.horario ?? ''}
                  </option>
                ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ip-horario">Horario</Label>
            <Input
              id="ip-horario"
              value={datos.horario ?? ''}
              onChange={(e) => set('horario', e.target.value)}
              placeholder="Ej: lunes a viernes 08:00 a 17:30"
            />
          </div>
        </div>
        {pocoAviso && minimaAviso && (
          <p role="alert" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              El procedimiento pide solicitar el ingreso con <b>{DIAS_AVISO} días hábiles</b> de anticipación (desde el{' '}
              <b className="font-mono-tabular">{fmtFecha(minimaAviso)}</b>). Puedes enviarla igual, pero queda marcada con poca anticipación y
              puede que no todo esté listo el primer día.
            </span>
          </p>
        )}
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

      <Seccion titulo="¿Qué necesita para empezar?" detalle="Cada opción crea una tarea para el área que la hace.">
        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Se crean siempre:{' '}
          {siempre.map((t, k) => (
            <span key={t.titulo}>
              {k > 0 && ' · '}
              <b className="text-foreground">{t.titulo}</b> ({t.area})
            </span>
          ))}
          .{datos.tipo_trabajador === 'contratista' && ' La inducción de bienvenida es solo para trabajadores de planta.'}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
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

        {datos.req_ti && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-semibold">Equipo computacional y accesos</p>
            <GrupoTi titulo="Equipo y correo">
              {ITEMS_TI.map((it) => (
                <label key={it.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={datos[it.key]} onChange={(e) => set(it.key, e.target.checked)} className="accent-[hsl(var(--brand))]" />
                  {it.label}
                </label>
              ))}
            </GrupoTi>
            <GrupoTi titulo="Licencias">
              {LICENCIAS_TI.map((it) => (
                <label key={it.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={datos.ti_licencias.includes(it.key)}
                    onChange={(e) => alternar('ti_licencias', it.key, e.target.checked)}
                    className="accent-[hsl(var(--brand))]"
                  />
                  {it.label}
                </label>
              ))}
            </GrupoTi>
            <GrupoTi titulo="Acceso a portales">
              {PORTALES_TI.map((it) => (
                <label key={it.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={datos.ti_portales.includes(it.key)}
                    onChange={(e) => alternar('ti_portales', it.key, e.target.checked)}
                    className="accent-[hsl(var(--brand))]"
                  />
                  {it.label}
                </label>
              ))}
            </GrupoTi>
            <div className="space-y-1">
              <Label htmlFor="ip-ti-otros">Otros</Label>
              <Input
                id="ip-ti-otros"
                value={datos.ti_otros ?? ''}
                onChange={(e) => set('ti_otros', e.target.value)}
                placeholder="Otro software, accesos a sistemas, celular, impresora…"
              />
            </div>
          </div>
        )}

        {tallasVisibles.length > 0 && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-semibold">Tallas</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {tallasVisibles.map((k) => {
                const opciones: readonly string[] = TALLAS[k].opciones
                const actual = datos[k]
                return (
                  <div key={k} className="space-y-1">
                    <Label htmlFor={`ip-${k}`}>{TALLAS[k].label}</Label>
                    <select id={`ip-${k}`} value={actual ?? ''} onChange={(e) => set(k, e.target.value || null)} className={selectClase}>
                      <option value="">Elegir</option>
                      {/* una talla guardada que ya no está en la lista se sigue mostrando */}
                      {actual && !opciones.includes(actual) && <option>{actual}</option>}
                      {opciones.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
            <div className="space-y-1">
              <Label htmlFor="ip-tallas">Otras tallas u observaciones</Label>
              <Input
                id="ip-tallas"
                value={datos.tallas ?? ''}
                onChange={(e) => set('tallas', e.target.value)}
                placeholder="Si necesita una talla fuera de la lista (zapato 44, polera XXL…), indícala aquí"
              />
            </div>
          </div>
        )}

        {datos.req_vehiculo && (
          <div className="space-y-1 rounded-md border p-3">
            <Label htmlFor="ip-licencia">Licencia o certificación requerida</Label>
            <Input
              id="ip-licencia"
              list="ip-licencias"
              value={datos.licencia_requerida ?? ''}
              onChange={(e) => set('licencia_requerida', e.target.value)}
              placeholder="Elige o escribe"
            />
            <datalist id="ip-licencias">
              {LICENCIAS.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="ip-obs">Observaciones</Label>
          <Textarea id="ip-obs" rows={2} value={datos.observacion ?? ''} onChange={(e) => set('observacion', e.target.value)} placeholder="Requerimientos especiales del cargo, etc." />
        </div>
      </Seccion>
    </div>
  )
}
