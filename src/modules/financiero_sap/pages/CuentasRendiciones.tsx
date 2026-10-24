import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'
import { Checkbox } from '@/modules/financiero/components/ui/checkbox'
import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { Aviso, Cargando } from '../components/Estados'
import { SelectorCodigo, type Opcion } from '../components/rendiciones'
import { useCatalogos } from '../hooks/useDatosFin'
import { usePermisosFin } from '../hooks/usePermisosFin'
import { RUTA } from '../lib/rutas'
import {
  cargarCatalogosSap,
  cargarConfig,
  cargarNombresCampos,
  guardarCategorias,
  guardarConfig,
  REGLAS_CECO,
  type Categoria,
  type ConfigRendiciones,
  type CuentaSap,
} from '../lib/rendiciones'

// Tabla de cuentas de Rendiciones: qué cuenta contable y qué regla de CECO lleva cada categoría de gasto de
// Rindegastos, la contrapartida y qué campos extra de Rindegastos traen el CECO, el proyecto y el documento.
// Las categorías aparecen solas cuando llega el primer gasto que las usa.

const NINGUNO = '__ninguno__'

function CampoExtra({
  label,
  detalle,
  valor,
  nombres,
  onCambio,
  disabled,
}: {
  label: string
  detalle: string
  valor: string | null
  nombres: string[]
  onCambio: (v: string | null) => void
  disabled: boolean
}) {
  const lista = valor && !nombres.includes(valor) ? [valor, ...nombres] : nombres
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <Select value={valor ?? NINGUNO} onValueChange={(v) => onCambio(v === NINGUNO ? null : v)} disabled={disabled}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NINGUNO}>Ninguno</SelectItem>
          {lista.map((n) => (
            <SelectItem key={n} value={n}>{n}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">{detalle}</span>
    </label>
  )
}

export default function CuentasRendiciones() {
  const { rendiciones_aprobar: puedeEditar } = usePermisosFin()
  const { catalogos } = useCatalogos()
  const [config, setConfig] = useState<ConfigRendiciones | null>(null)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [originales, setOriginales] = useState<Categoria[]>([])
  const [nombres, setNombres] = useState<string[]>([])
  const [cuentasSap, setCuentasSap] = useState<CuentaSap[]>([])
  const [tiposTexto, setTiposTexto] = useState('')
  const [error, setError] = useState<Error | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    const [c, n, s] = await Promise.all([cargarConfig(), cargarNombresCampos(), cargarCatalogosSap()])
    setConfig(c.config)
    setTiposTexto(c.config.tipos_excluidos.join(', '))
    setCategorias(c.categorias)
    setOriginales(c.categorias)
    setNombres(n)
    setCuentasSap(s.cuentas)
  }

  useEffect(() => {
    cargar().catch(setError)
  }, [])

  const opcCuentas = useMemo<Opcion[]>(
    () => cuentasSap.filter((c) => c.activa).map((c) => ({ valor: c.codigo, etiqueta: `${c.codigo_formato ?? c.codigo} · ${c.nombre}` })),
    [cuentasSap],
  )
  const cecos = useMemo(() => (catalogos?.cecos ?? []).filter((c) => c.activo), [catalogos])

  const cambiadas = categorias.filter((c) => {
    const o = originales.find((x) => x.categoria === c.categoria)
    return !o || o.cuenta !== c.cuenta || o.regla_ceco !== c.regla_ceco || o.ceco_fijo !== c.ceco_fijo || o.excluir !== c.excluir
  })
  const sinCuenta = categorias.filter((c) => !c.cuenta && !c.excluir).length

  function editar(categoria: string, cambio: Partial<Categoria>) {
    setCategorias((cs) => cs.map((c) => (c.categoria === categoria ? { ...c, ...cambio } : c)))
  }

  async function guardar(que: 'config' | 'categorias') {
    if (!config) return
    setGuardando(true)
    try {
      if (que === 'config') {
        await guardarConfig({ ...config, tipos_excluidos: tiposTexto.split(',').map((t) => t.trim()).filter(Boolean) })
      } else {
        await guardarCategorias(cambiadas.map(({ categoria, cuenta, regla_ceco, ceco_fijo, excluir }) => ({ categoria, cuenta, regla_ceco, ceco_fijo, excluir })))
      }
      await cargar()
      toast.success(que === 'config' ? 'Configuración guardada.' : 'Tabla de cuentas guardada.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  if (error) return <Aviso error={error} />
  if (!config) return <Cargando />

  return (
    <div className="max-w-5xl space-y-4">
      <Link to={RUTA.rendiciones} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Rendiciones
      </Link>
      <p className="text-sm text-muted-foreground">
        Define cómo se arma el asiento de cada rendición. Los cambios se aplican a las rendiciones que no estén aprobadas; las aprobadas
        conservan su asiento.
      </p>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Contrapartida y campos de Rindegastos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm font-medium">Cuenta de contrapartida (haber)</span>
            <SelectorCodigo
              opciones={opcCuentas}
              valor={config.cuenta_contrapartida}
              onCambio={(v) => setConfig({ ...config, cuenta_contrapartida: v })}
              placeholder="Escribe el código o el nombre (p. ej. Fondos por rendir)"
              disabled={!puedeEditar}
              className="h-9 text-sm"
              ariaLabel="Cuenta de contrapartida"
            />
            <span className="text-xs text-muted-foreground">Lo que se le debe al colaborador o el fondo por rendir que se rebaja.</span>
          </label>
          <CampoExtra
            label="Campo con el CECO"
            detalle="Para las categorías con regla «Campo del gasto». Se toman los 4 dígitos del inicio (1101 - SIP Santiago → 1101)."
            valor={config.campo_ceco}
            nombres={nombres}
            onCambio={(v) => setConfig({ ...config, campo_ceco: v })}
            disabled={!puedeEditar}
          />
          <CampoExtra
            label="Campo con el proyecto"
            detalle="Código de proyecto de SAP. Se toma lo anterior a « - » (PRJ-001 - Obra → PRJ-001)."
            valor={config.campo_proyecto}
            nombres={nombres}
            onCambio={(v) => setConfig({ ...config, campo_proyecto: v })}
            disabled={!puedeEditar}
          />
          <CampoExtra
            label="Campo con el tipo de documento"
            detalle="Boleta, factura, etc. Sirve para dejar fuera las facturas."
            valor={config.campo_tipo_documento}
            nombres={nombres}
            onCambio={(v) => setConfig({ ...config, campo_tipo_documento: v })}
            disabled={!puedeEditar}
          />
          <CampoExtra
            label="Campo con el número de documento"
            detalle="Va en la glosa de cada línea."
            valor={config.campo_numero_documento}
            nombres={nombres}
            onCambio={(v) => setConfig({ ...config, campo_numero_documento: v })}
            disabled={!puedeEditar}
          />
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Tipos de documento que no van al asiento</span>
            <Input value={tiposTexto} onChange={(e) => setTiposTexto(e.target.value)} disabled={!puedeEditar} className="h-9" placeholder="factura" />
            <span className="text-xs text-muted-foreground">
              Separados por coma; basta que el tipo contenga el texto. Las facturas suelen entrar a SAP por la recepción de documentos del SII.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Rendiciones aprobadas desde</span>
            <Input type="date" value={config.desde} onChange={(e) => setConfig({ ...config, desde: e.target.value })} disabled={!puedeEditar} className="h-9 w-44" />
            <span className="text-xs text-muted-foreground">La sincronización trae las rendiciones cerradas en Rindegastos desde esta fecha.</span>
          </label>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <Checkbox
              className="mt-0.5"
              checked={config.excluir_con_iva}
              disabled={!puedeEditar}
              onCheckedChange={(v) => setConfig({ ...config, excluir_con_iva: v === true })}
            />
            <span>
              Sin tipo de documento, dejar fuera los gastos que traen IVA
              <span className="block text-xs text-muted-foreground">Un gasto con IVA separado normalmente es una factura.</span>
            </span>
          </label>
          {puedeEditar && (
            <div className="sm:col-span-2">
              <Button disabled={guardando} onClick={() => guardar('config')}>
                <Save className="mr-1 h-4 w-4" /> Guardar configuración
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cuenta por categoría de gasto</CardTitle>
          <p className="text-xs text-muted-foreground">
            {categorias.length === 0
              ? 'Las categorías de Rindegastos aparecen aquí con la primera sincronización que traiga gastos.'
              : sinCuenta > 0
                ? `${sinCuenta} ${sinCuenta === 1 ? 'categoría' : 'categorías'} sin cuenta: sus gastos no se pueden aprobar.`
                : 'Todas las categorías tienen cuenta.'}
          </p>
        </CardHeader>
        {categorias.length > 0 && (
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-y bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">Categoría</th>
                  <th className="w-72 px-3 py-2 text-left font-semibold">Cuenta</th>
                  <th className="w-48 px-3 py-2 text-left font-semibold">CECO</th>
                  <th className="w-40 px-3 py-2 text-left font-semibold">CECO fijo</th>
                  <th className="px-3 py-2 text-center font-semibold">Fuera del asiento</th>
                </tr>
              </thead>
              <tbody>
                {categorias.map((c) => (
                  <tr key={c.categoria} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">
                      {c.categoria}
                      {c.categoria_codigo && <span className="ml-1 text-xs text-muted-foreground">({c.categoria_codigo})</span>}
                    </td>
                    <td className="px-3 py-2">
                      <SelectorCodigo
                        opciones={opcCuentas}
                        valor={c.cuenta}
                        onCambio={(v) => editar(c.categoria, { cuenta: v })}
                        placeholder="Sin cuenta"
                        disabled={!puedeEditar || c.excluir}
                        ariaLabel={`Cuenta de ${c.categoria}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select value={c.regla_ceco} onValueChange={(v) => editar(c.categoria, { regla_ceco: v as Categoria['regla_ceco'] })} disabled={!puedeEditar || c.excluir}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {REGLAS_CECO.map((r) => (
                            <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      {c.regla_ceco === 'fijo' && (
                        <Select value={c.ceco_fijo ?? ''} onValueChange={(v) => editar(c.categoria, { ceco_fijo: v })} disabled={!puedeEditar || c.excluir}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Elige" /></SelectTrigger>
                          <SelectContent>
                            {cecos.map((x) => (
                              <SelectItem key={x.codigo} value={x.codigo}>{x.codigo} · {x.nombre}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Checkbox
                        aria-label={`${c.categoria} fuera del asiento`}
                        checked={c.excluir}
                        disabled={!puedeEditar}
                        onCheckedChange={(v) => editar(c.categoria, { excluir: v === true })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {puedeEditar && (
              <div className="flex items-center gap-3 p-3">
                <Button disabled={guardando || cambiadas.length === 0} onClick={() => guardar('categorias')}>
                  <Save className="mr-1 h-4 w-4" /> Guardar tabla de cuentas
                </Button>
                {cambiadas.length > 0 && <span className="text-xs text-muted-foreground">{cambiadas.length} sin guardar</span>}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
