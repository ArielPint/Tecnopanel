import { useState, useEffect } from 'react'
import { Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/modules/crm/contexts/AuthContext'
import type { TipoVenta } from '@/modules/crm/types/database'

interface Cliente { id: string; razon_social: string }

const TIPO_VENTA_LABELS: Record<TipoVenta, string> = {
  Proyecto: 'Proyecto',
  Producto: 'Venta Directa',
  Kit: 'Viviendas Industrializadas',
}

// Etapa inicial forzada segun tipo de venta: Proyecto entra por Clasificacion;
// Producto (Venta Directa) y Kit (Viviendas Industrializadas) entran directo a
// Costos y Presupuestos, ya que esa etapa fusiona lo que antes eran Cubicacion y Presupuestos.
const ETAPA_INICIAL_POR_TIPO: Record<TipoVenta, string> = {
  Proyecto: 'Clasificación',
  Producto: 'Costos y Presupuestos',
  Kit: 'Costos y Presupuestos',
}

export const FAMILIA_PRODUCTOS_OPCIONES = ['TecnoPanel', 'TecnoTruss', 'TecnoFrame', 'Escaleras'] as const

export const ALCANCES_OPCIONES = ['Memoria', 'Planos estructurales', 'Desarrollo de arquitectura', 'Modulación Simple'] as const

// Subconjunto de regiones/comunas de Chile, pensado para ser facil de ampliar.
export const REGIONES_COMUNAS: Record<string, string[]> = {
  'Región Metropolitana': ['Santiago', 'Puente Alto', 'Maipú', 'La Florida', 'Las Condes', 'San Bernardo', 'Colina', 'Melipilla'],
  'Valparaíso': ['Valparaíso', 'Viña del Mar', 'Quilpué', 'San Antonio', 'Los Andes', 'Quillota'],
  'Biobío': ['Concepción', 'Talcahuano', 'Los Ángeles', 'Chillán', 'Coronel'],
  'Maule': ['Talca', 'Curicó', 'Linares', 'Constitución'],
  'Araucanía': ['Temuco', 'Villarrica', 'Angol', 'Padre Las Casas'],
  'Los Lagos': ['Puerto Montt', 'Osorno', 'Castro', 'Puerto Varas'],
  'Antofagasta': ['Antofagasta', 'Calama', 'Tocopilla'],
  'Coquimbo': ['La Serena', 'Coquimbo', 'Ovalle'],
  "O'Higgins": ['Rancagua', 'San Fernando', 'Rengo'],
  'Los Ríos': ['Valdivia', 'La Unión'],
  'Ñuble': ['Chillán', 'San Carlos'],
  'Tarapacá': ['Iquique', 'Alto Hospicio'],
  'Atacama': ['Copiapó', 'Vallenar'],
  'Magallanes': ['Punta Arenas', 'Puerto Natales'],
  'Aysén': ['Coyhaique', 'Puerto Aysén'],
  'Arica y Parinacota': ['Arica', 'Putre'],
}
const REGIONES = Object.keys(REGIONES_COMUNAS)

interface FormData {
  nombre: string; cliente_id: string; tipo_venta: TipoVenta;
  monto_estimado: string; probabilidad: string;
  fecha_cierre_est: string; descripcion: string;
  nombre_entidad_patrocinante: string;
  region: string; comuna: string;
  cantidad_casas: string; cantidad_tipos_casas: string;
  fecha_adjudicacion_est: string; fecha_inicio_despachos_est: string;
  duracion_meses_est: string;
  familia_productos: string[];
  alcances: string[];
}
const INIT: FormData = {
  nombre:'', cliente_id:'', tipo_venta:'Proyecto',
  monto_estimado:'', probabilidad:'50',
  fecha_cierre_est:'', descripcion:'',
  nombre_entidad_patrocinante:'',
  region:'', comuna:'',
  cantidad_casas:'', cantidad_tipos_casas:'',
  fecha_adjudicacion_est:'', fecha_inicio_despachos_est:'',
  duracion_meses_est:'',
  familia_productos: [],
  alcances: [],
}
function genCodigo() { const d=new Date(); return 'OPP-'+d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+'-'+(crypto.getRandomValues(new Uint16Array(1))[0]%9000+1000) }

interface Props { isOpen: boolean; onClose: () => void; onSuccess: () => void }

export default function NuevaOportunidadModal({ isOpen, onClose, onSuccess }: Props) {
  const { profile } = useAuth()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [form, setForm] = useState<FormData>(INIT)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showNuevoCliente, setShowNuevoCliente] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState({ razon_social: '', rut: '', rubro: '' })
  const [creandoCliente, setCreandoCliente] = useState(false)
  const [errorCliente, setErrorCliente] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setForm(INIT); setError(''); setArchivo(null)
    supabase.from('clientes').select('id,razon_social').order('razon_social')
      .then(({ data }) => setClientes((data as Cliente[]) ?? []))
  }, [isOpen])

  const comunasDisponibles = form.region ? (REGIONES_COMUNAS[form.region] ?? []) : []
  const etapaInicial = ETAPA_INICIAL_POR_TIPO[form.tipo_venta]

  async function crearClienteInline() {
    if (!nuevoCliente.razon_social.trim()) { setErrorCliente('La razón social es requerida'); return }
    setCreandoCliente(true); setErrorCliente('')
    const { data, error: err } = await supabase.from('clientes').insert({
      razon_social: nuevoCliente.razon_social.trim(),
      rut: nuevoCliente.rut.trim() || null,
      rubro: nuevoCliente.rubro.trim() || null,
      creado_por: profile?.id ?? null,
    }).select('id,razon_social').single()
    if (err) { setErrorCliente(err.message); setCreandoCliente(false); return }
    const nuevo = data as Cliente
    setClientes(cs => [...cs, nuevo].sort((a, b) => a.razon_social.localeCompare(b.razon_social)))
    setForm(f => ({ ...f, cliente_id: nuevo.id }))
    setNuevoCliente({ razon_social: '', rut: '', rubro: '' })
    setShowNuevoCliente(false); setCreandoCliente(false)
  }

  function toggleFamiliaProducto(valor: string) {
    setForm(f => ({
      ...f,
      familia_productos: f.familia_productos.includes(valor)
        ? f.familia_productos.filter(v => v !== valor)
        : [...f.familia_productos, valor],
    }))
  }

  function toggleAlcance(valor: string) {
    setForm(f => ({
      ...f,
      alcances: f.alcances.includes(valor)
        ? f.alcances.filter(v => v !== valor)
        : [...f.alcances, valor],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) return setError('El nombre es requerido')
    if (form.comuna && form.region && !comunasDisponibles.includes(form.comuna)) {
      return setError('La comuna seleccionada no pertenece a la región elegida')
    }
    setSaving(true); setError('')
    const codigo = genCodigo()
    const { data, error: err } = await supabase.from('oportunidades').insert({
      codigo, nombre: form.nombre.trim(), cliente_id: form.cliente_id || null,
      vendedor_id: profile?.id ?? null, tipo_venta: form.tipo_venta,
      monto_estimado: form.monto_estimado ? Number(form.monto_estimado) : null,
      probabilidad: Number(form.probabilidad), etapa_actual: etapaInicial,
      fecha_cierre_est: form.fecha_cierre_est || null, descripcion: form.descripcion || null,
      nombre_entidad_patrocinante: form.tipo_venta === 'Kit' ? (form.nombre_entidad_patrocinante.trim() || null) : null,
      region: form.region || null, comuna: form.comuna || null,
      cantidad_casas: form.cantidad_casas ? Number(form.cantidad_casas) : null,
      cantidad_tipos_casas: form.cantidad_tipos_casas ? Number(form.cantidad_tipos_casas) : null,
      fecha_adjudicacion_est: form.fecha_adjudicacion_est || null,
      fecha_inicio_despachos_est: form.fecha_inicio_despachos_est || null,
      duracion_meses_est: form.duracion_meses_est ? Number(form.duracion_meses_est) : null,
      familia_productos: form.familia_productos.length ? form.familia_productos : null,
      alcances: form.alcances.length ? form.alcances : null,
    }).select('id').single()
    if (err) { setError(err.message); setSaving(false); return }
    const oportunidadId = (data as { id: string })?.id ?? null

    if (archivo && oportunidadId) {
      const ext = archivo.name.split('.').pop() ?? ''
      const path = oportunidadId + '/' + Date.now() + '-' + archivo.name
      const { error: upErr } = await supabase.storage.from('oportunidades').upload(path, archivo)
      if (!upErr) {
        await supabase.from('oportunidad_documentos').insert({
          oportunidad_id: oportunidadId, nombre: archivo.name, tipo: 'archivo',
          url: path, extension: ext, tamanio_bytes: archivo.size,
          subido_por: profile?.id, etapa: 'Clasificación',
        })
      } else {
        setSaving(false)
        setError(`La oportunidad se creó, pero el archivo no se pudo subir: ${upErr.message}`)
        onSuccess()
        return
      }
    }

    await supabase.from('notifications').insert({
      user_id: profile?.id,
      tipo: 'oportunidad_nueva',
      titulo: `Nueva oportunidad: ${form.nombre.trim()}`,
      mensaje: `${codigo} · etapa inicial: ${etapaInicial}`,
      oportunidad_id: oportunidadId,
    })
    setSaving(false); onSuccess(); onClose()
  }

  if (!isOpen) return null
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">Nueva Oportunidad</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
            <input value={form.nombre} onChange={e => setForm(f=>({...f,nombre:e.target.value}))} required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-700">Cliente</label>
              <button type="button" onClick={() => setShowNuevoCliente(s => !s)} className="text-xs font-medium text-crm-red hover:underline">
                {showNuevoCliente ? 'Cancelar' : '+ Crear cliente nuevo'}
              </button>
            </div>
            {showNuevoCliente ? (
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 mb-2">
                <input value={nuevoCliente.razon_social} onChange={e => setNuevoCliente(c=>({...c,razon_social:e.target.value}))}
                  placeholder="Razón social *" className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-900" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={nuevoCliente.rut} onChange={e => setNuevoCliente(c=>({...c,rut:e.target.value}))}
                    placeholder="RUT" className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-900" />
                  <input value={nuevoCliente.rubro} onChange={e => setNuevoCliente(c=>({...c,rubro:e.target.value}))}
                    placeholder="Rubro" className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-900" />
                </div>
                {errorCliente && <p className="text-xs text-red-600">{errorCliente}</p>}
                <button type="button" onClick={crearClienteInline} disabled={creandoCliente}
                  className="px-3 py-1 text-xs text-white rounded disabled:opacity-60" style={{background:'#ed3224'}}>
                  {creandoCliente ? 'Creando...' : 'Crear y seleccionar'}
                </button>
              </div>
            ) : null}
            <select value={form.cliente_id} onChange={e => setForm(f=>({...f,cliente_id:e.target.value}))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red">
              <option value="">Sin cliente</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
              <select value={form.tipo_venta} onChange={e => setForm(f=>({...f,tipo_venta:e.target.value as TipoVenta}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red">
                <option value="Proyecto">{TIPO_VENTA_LABELS.Proyecto}</option>
                <option value="Producto">{TIPO_VENTA_LABELS.Producto}</option>
                <option value="Kit">{TIPO_VENTA_LABELS.Kit}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Etapa inicial</label>
              <input disabled value={etapaInicial} className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg text-sm" />
            </div>
          </div>

          {form.tipo_venta === 'Kit' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre entidad patrocinante</label>
              <input value={form.nombre_entidad_patrocinante} onChange={e => setForm(f=>({...f,nombre_entidad_patrocinante:e.target.value}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Monto estimado (CLP)</label>
              <input type="number" value={form.monto_estimado} onChange={e => setForm(f=>({...f,monto_estimado:e.target.value}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de presentación</label>
              <input type="date" value={form.fecha_cierre_est} onChange={e => setForm(f=>({...f,fecha_cierre_est:e.target.value}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Región</label>
              <select value={form.region} onChange={e => setForm(f=>({...f,region:e.target.value,comuna:''}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red">
                <option value="">Sin región</option>
                {REGIONES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Comuna</label>
              <select value={form.comuna} onChange={e => setForm(f=>({...f,comuna:e.target.value}))} disabled={!form.region}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red disabled:bg-gray-50 disabled:text-gray-400">
                <option value="">{form.region ? 'Sin comuna' : 'Elige una región primero'}</option>
                {comunasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad de casas</label>
              <input type="number" min="0" value={form.cantidad_casas} onChange={e => setForm(f=>({...f,cantidad_casas:e.target.value}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad de tipos de casas</label>
              <input type="number" min="0" value={form.cantidad_tipos_casas} onChange={e => setForm(f=>({...f,cantidad_tipos_casas:e.target.value}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha estimada de adjudicación</label>
              <input type="date" value={form.fecha_adjudicacion_est} onChange={e => setForm(f=>({...f,fecha_adjudicacion_est:e.target.value}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Fecha estimada inicio despachos</label>
              <input type="date" value={form.fecha_inicio_despachos_est} onChange={e => setForm(f=>({...f,fecha_inicio_despachos_est:e.target.value}))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Duración estimada del proyecto (meses)</label>
            <input type="number" min="0" value={form.duracion_meses_est} onChange={e => setForm(f=>({...f,duracion_meses_est:e.target.value}))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Familia de productos a cotizar</label>
            <div className="flex flex-wrap gap-3">
              {FAMILIA_PRODUCTOS_OPCIONES.map(opcion => (
                <label key={opcion} className="flex items-center gap-1.5 text-sm text-gray-600">
                  <input type="checkbox" checked={form.familia_productos.includes(opcion)} onChange={() => toggleFamiliaProducto(opcion)}
                    className="rounded border-gray-300 text-crm-red focus:ring-crm-red" />
                  {opcion}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Alcances</label>
            <div className="flex flex-wrap gap-3">
              {ALCANCES_OPCIONES.map(opcion => (
                <label key={opcion} className="flex items-center gap-1.5 text-sm text-gray-600">
                  <input type="checkbox" checked={form.alcances.includes(opcion)} onChange={() => toggleAlcance(opcion)}
                    className="rounded border-gray-300 text-crm-red focus:ring-crm-red" />
                  {opcion}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Plano (PDF / DWG / Autocad)</label>
            <input type="file" accept=".pdf,.dwg,.dxf" onChange={e => setArchivo(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-200 file:text-xs file:font-medium file:bg-gray-50 hover:file:bg-gray-100" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Probabilidad: {form.probabilidad}%</label>
            <input type="range" min="0" max="100" step="5" value={form.probabilidad}
              onChange={e => setForm(f=>({...f,probabilidad:e.target.value}))} className="w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
            <textarea value={form.descripcion} onChange={e => setForm(f=>({...f,descripcion:e.target.value}))} rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-crm-red resize-none" />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
              style={{background:'#ed3224'}}>
              {saving && <Loader2 size={14} className="animate-spin"/>}
              {saving ? 'Guardando...' : 'Crear oportunidad'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
