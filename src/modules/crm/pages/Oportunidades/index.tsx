import { useEffect, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { Oportunidad, EtapaOportunidad, TipoVenta } from '@/modules/crm/types/database'
import OportunidadDrawer from '@/modules/crm/components/OportunidadDrawer'
import NuevaOportunidadModal from '@/modules/crm/components/NuevaOportunidadModal'

const ETAPAS: EtapaOportunidad[] = [
  'Clasificación','Ingeniería','Desarrollo','Costos y Presupuestos',
  'Revisión Vendedor','Negociación',
]

const TIPO_COLOR: Record<TipoVenta, string> = {
  Proyecto: 'bg-purple-100 text-purple-700',
  Producto: 'bg-blue-100 text-blue-700',
  Kit: 'bg-amber-100 text-amber-700',
}

const TIPO_VENTA_LABELS: Record<TipoVenta, string> = {
  Proyecto: 'Proyecto',
  Producto: 'Venta Directa',
  Kit: 'Viviendas Industrializadas',
}

function formatMM(n: number) { return (n / 1_000_000).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MM' }

export default function Oportunidades() {
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<Oportunidad | null>(null)

  async function load() {
    const { data: opps } = await supabase
      .from('oportunidades')
      .select('*, cliente:clientes(razon_social), vendedor:profiles(nombre,apellido)')
      .not('etapa_actual','in','("Ganado","Perdido")')
      .order('updated_at',{ascending:false})
    setOportunidades((opps as Oportunidad[]) || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtradas = oportunidades.filter(o =>
    o.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    o.codigo.toLowerCase().includes(busqueda.toLowerCase())
  )
  const porEtapa = (etapa: EtapaOportunidad) => filtradas.filter(o => o.etapa_actual === etapa)

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-crm-red border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 md:px-6 py-3 border-b border-slate-200 bg-white flex items-center gap-3">
        <p className="text-xs text-gray-500 hidden sm:block">{filtradas.length} en curso</p>
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar..." className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-crm-red" />
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-crm-red hover:bg-crm-dark text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors flex-shrink-0">
          <Plus size={16} /><span className="hidden sm:inline">Nueva</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {ETAPAS.map(etapa => {
          const cards = porEtapa(etapa)
          if (cards.length === 0) return null
          return (
            <div key={etapa}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-gray-700">{etapa}</span>
                <span className="text-xs bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">{cards.length}</span>
              </div>
              <div className="space-y-2">
                {cards.map(opp => (
                  <div key={opp.id} onClick={() => setSelected(opp)}
                    className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-red-200 transition-all cursor-pointer flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-400 font-mono">{opp.codigo}</span>
                        <span className={'text-xs px-1.5 py-0.5 rounded-full font-medium ' + TIPO_COLOR[opp.tipo_venta]}>{TIPO_VENTA_LABELS[opp.tipo_venta] ?? opp.tipo_venta}</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-800 leading-tight">{opp.nombre}</p>
                      {opp.cliente && <p className="text-xs text-gray-500 mt-0.5 truncate">{opp.cliente.razon_social}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {opp.monto_estimado != null && (
                        <>
                          <p className="text-sm font-bold text-crm-red">{'$' + opp.monto_estimado.toLocaleString('es-CL')}</p>
                          <p className="text-[10px] text-gray-400">{formatMM(opp.monto_estimado)}</p>
                        </>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">{opp.probabilidad ?? 0}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {filtradas.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <p className="text-sm">Sin oportunidades</p>
          </div>
        )}
      </div>

      <NuevaOportunidadModal isOpen={showForm} onClose={() => setShowForm(false)} onSuccess={() => { load() }} />
      {selected && <OportunidadDrawer oportunidad={selected} onClose={() => setSelected(null)} onUpdate={() => { setSelected(null); load() }} />}
    </div>
  )
}
