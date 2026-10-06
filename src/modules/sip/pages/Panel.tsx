import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Cargando, selectClase } from '../components/comunes'
import { eliminarPanel, guardarPanel, guardarReceta } from '../lib/api'
import { m2Panel } from '../lib/calculo'
import { fmtNum } from '../lib/formato'
import { RUTA } from '../lib/rutas'
import { usePermisosSip } from '../hooks/usePermisosSip'
import { useCatalogo } from '../hooks/useCatalogo'

interface FilaReceta {
  key: string
  material_id: string
  cantidad: string
}

let correlativo = 0
const filaVacia = (): FilaReceta => ({ key: `n${++correlativo}`, material_id: '', cantidad: '' })
const aNumero = (s: string) => Number(s.replace(',', '.'))
const entOpcional = (s: string) => (s.trim() ? Number(s) : null)

/** Ficha del panel: datos, medidas y su receta (cantidad base de cada material por 1 panel). */
export default function Panel() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { puede } = usePermisosSip('recetas')
  const editable = puede('editar')
  const { paneles, materiales, recetas, materialPorId, loading, recargar } = useCatalogo()

  const [codigo, setCodigo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [ancho, setAncho] = useState('')
  const [largo, setLargo] = useState('')
  const [espesor, setEspesor] = useState('')
  const [activo, setActivo] = useState(true)
  const [filas, setFilas] = useState<FilaReceta[]>([filaVacia()])
  const [guardando, setGuardando] = useState(false)
  const [listo, setListo] = useState(!id)

  useEffect(() => {
    if (!id || loading || listo) return
    const p = paneles.find((x) => x.id === id)
    if (!p) {
      toast.error('El panel no existe')
      navigate(RUTA.recetas, { replace: true })
      return
    }
    setCodigo(p.codigo)
    setDescripcion(p.descripcion)
    setAncho(p.ancho_mm ? String(p.ancho_mm) : '')
    setLargo(p.largo_mm ? String(p.largo_mm) : '')
    setEspesor(p.espesor_mm ? String(p.espesor_mm) : '')
    setActivo(p.activo)
    const r = recetas
      .filter((x) => x.panel_id === id)
      .sort((a, b) => (materialPorId.get(a.material_id)?.codigo ?? '').localeCompare(materialPorId.get(b.material_id)?.codigo ?? ''))
      .map((x) => ({ key: x.material_id, material_id: x.material_id, cantidad: String(x.cantidad) }))
    setFilas(r.length ? r : [filaVacia()])
    setListo(true)
  }, [id, loading, listo, paneles, recetas, materialPorId, navigate])

  if (loading || !listo) return <Cargando />

  const cambiar = (key: string, c: Partial<FilaReceta>) => setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...c } : f)))
  const m2 = m2Panel({ ancho_mm: entOpcional(ancho), largo_mm: entOpcional(largo) })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const receta = filas.filter((f) => f.material_id || f.cantidad.trim())
    for (const f of receta) {
      if (!f.material_id) return toast.error('Falta elegir el material en una línea de la receta')
      if (!(aNumero(f.cantidad) > 0)) return toast.error(`${materialPorId.get(f.material_id)?.codigo}: la cantidad debe ser mayor que 0`)
    }
    if (new Set(receta.map((f) => f.material_id)).size !== receta.length) return toast.error('Un material está repetido en la receta')
    for (const [v, n] of [
      [ancho, 'ancho'],
      [largo, 'largo'],
      [espesor, 'espesor'],
    ]) {
      if (v.trim() && !(Number.isInteger(Number(v)) && Number(v) > 0)) return toast.error(`El ${n} debe ser un número entero de milímetros`)
    }

    setGuardando(true)
    try {
      const panelId = await guardarPanel({
        id,
        codigo,
        descripcion,
        ancho_mm: entOpcional(ancho),
        largo_mm: entOpcional(largo),
        espesor_mm: entOpcional(espesor),
        activo,
      })
      if (receta.length) await guardarReceta(panelId, receta.map((f) => ({ material_id: f.material_id, cantidad: aNumero(f.cantidad) })))
      else if (id && recetas.some((r) => r.panel_id === id)) toast.warning('La receta quedó como estaba: no se puede dejar vacía')
      toast.success(id ? 'Panel guardado' : 'Panel creado')
      await recargar()
      navigate(RUTA.recetas)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
      setGuardando(false)
    }
  }

  async function eliminar() {
    if (!id || !window.confirm(`¿Eliminar el panel ${codigo}? Si ya tiene producción registrada no se puede: desactívelo.`)) return
    try {
      await eliminarPanel(id)
      toast.success('Panel eliminado')
      await recargar()
      navigate(RUTA.recetas, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  const usados = new Set(filas.map((f) => f.material_id))

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-4xl space-y-4">
      <div>
        <Link to={RUTA.recetas} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Paneles y recetas
        </Link>
        <h1 className="mt-1 text-xl font-extrabold">{id ? `Panel ${codigo}` : 'Nuevo panel'}</h1>
      </div>

      <fieldset disabled={!editable} className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Datos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-codigo">Código SAP</Label>
              <Input id="p-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} required placeholder="6602003" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-desc">Descripción</Label>
              <Input id="p-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required placeholder="PNL-STD 11,1/57/STD 11,1 ; 1220x2440x78mm" />
            </div>
            <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
              {[
                { id: 'ancho', label: 'Ancho (mm)', v: ancho, set: setAncho },
                { id: 'largo', label: 'Largo (mm)', v: largo, set: setLargo },
                { id: 'espesor', label: 'Espesor (mm)', v: espesor, set: setEspesor },
              ].map((c) => (
                <div key={c.id} className="flex flex-col gap-1.5">
                  <Label htmlFor={`p-${c.id}`}>{c.label}</Label>
                  <Input id={`p-${c.id}`} type="number" min={1} step={1} value={c.v} onChange={(e) => c.set(e.target.value)} className="w-28" />
                </div>
              ))}
              <p className="pb-2 text-sm text-muted-foreground">{m2 ? `${fmtNum(m2, 4)} m² por panel` : 'Sin medidas: se toman de la descripción ("…; 1220x2440x78mm")'}</p>
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox checked={activo} onCheckedChange={(v) => setActivo(!!v)} />
              Activo (se puede elegir al registrar producción)
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Receta por 1 panel</CardTitle>
            <p className="text-xs text-muted-foreground">
              Cantidad base de cada material. Cambiarla afecta solo la producción que se registre desde ahora.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {filas.map((f, i) => (
              <div key={f.key} className="flex gap-2">
                <select
                  value={f.material_id}
                  onChange={(e) => cambiar(f.key, { material_id: e.target.value })}
                  className={`${selectClase} min-w-0 flex-1`}
                  aria-label={`Material ${i + 1}`}
                >
                  <option value="">Elegir material…</option>
                  {materiales
                    .filter((m) => m.id === f.material_id || (m.activo && !usados.has(m.id)))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.codigo} · {m.descripcion} ({m.unidad})
                      </option>
                    ))}
                </select>
                <Input
                  inputMode="decimal"
                  value={f.cantidad}
                  onChange={(e) => cambiar(f.key, { cantidad: e.target.value })}
                  placeholder="Cantidad"
                  className="w-28 text-right font-mono-tabular"
                  aria-label={`Cantidad ${i + 1}`}
                />
                <span className="flex w-16 items-center text-xs text-muted-foreground">{materialPorId.get(f.material_id)?.unidad ?? ''}</span>
                {editable && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => setFilas((fs) => (fs.length === 1 ? [filaVacia()] : fs.filter((x) => x.key !== f.key)))} aria-label="Quitar">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {editable && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setFilas((fs) => [...fs, filaVacia()])}>
                  <Plus className="mr-1 h-4 w-4" /> Agregar material
                </Button>
                <Button type="button" variant="ghost" size="sm" asChild>
                  <Link to={RUTA.materiales}>¿Falta un material? Créelo en Materiales</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </fieldset>

      {editable && (
        <div className="flex justify-between gap-2">
          {id ? (
            <Button type="button" variant="outline" onClick={eliminar} className="text-destructive hover:text-destructive">
              <Trash2 className="mr-1 h-4 w-4" /> Eliminar
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      )}
    </form>
  )
}
