import { useEffect, useState } from 'react'
import { Trophy, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { Oportunidad } from '@/modules/crm/types/database'
import OportunidadDrawer from '@/modules/crm/components/OportunidadDrawer'

const TIPO_COLOR: Record<string,string>={Proyecto:'bg-purple-100 text-purple-700',Producto:'bg-blue-100 text-blue-700',Kit:'bg-amber-100 text-amber-700'}
type Filtro = 'todas' | 'Ganado' | 'Perdido'

export default function GanadasPerdidas(){
  const [opps,setOpps]=useState<Oportunidad[]>([])
  const [loading,setLoading]=useState(true)
  const [filtro,setFiltro]=useState<Filtro>('todas')
  const [sel,setSel]=useState<Oportunidad|null>(null)

  async function load(){
    setLoading(true)
    const {data}=await supabase.from('oportunidades').select('*,cliente:clientes(razon_social),vendedor:profiles(nombre,apellido)').in('etapa_actual',['Ganado','Perdido']).order('updated_at',{ascending:false})
    setOpps((data as Oportunidad[])||[])
    setLoading(false)
  }
  useEffect(()=>{load()},[])

  const filtradas = filtro==='todas' ? opps : opps.filter(o=>o.etapa_actual===filtro)
  const totalGanado = opps.filter(o=>o.etapa_actual==='Ganado').reduce((s,o)=>s+(o.monto_final??o.monto_estimado??0),0)

  if(loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-crm-red border-t-transparent rounded-full animate-spin"/></div>
  return(
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex gap-2">
            {(['todas','Ganado','Perdido'] as Filtro[]).map(f=>(
              <button key={f} onClick={()=>setFiltro(f)} className={'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors '+(filtro===f?'bg-crm-red text-white':'bg-white border border-slate-200 text-gray-600 hover:bg-gray-50')}>
                {f==='todas'?'Todas':f}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">{filtradas.length} oportunidades{filtro!=='Perdido'&&` · $${totalGanado.toLocaleString('es-CL')} ganado`}</p>
        </div>
        {filtradas.length===0?(<div className="flex flex-col items-center justify-center h-64 text-gray-400"><p className="text-sm">Sin oportunidades {filtro==='todas'?'ganadas o perdidas':filtro==='Ganado'?'ganadas':'perdidas'}</p></div>):(
          <div className="space-y-3 max-w-3xl">{filtradas.map(o=>(
            <div key={o.id} onClick={()=>setSel(o)} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-red-200 transition-all cursor-pointer">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400 font-mono">{o.codigo}</span>
                    <span className={'text-xs px-1.5 py-0.5 rounded-full font-medium '+(TIPO_COLOR[o.tipo_venta]??'bg-gray-100 text-gray-600')}>{o.tipo_venta}</span>
                    <span className={'text-xs px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1 '+(o.etapa_actual==='Ganado'?'bg-green-100 text-green-700':'bg-red-100 text-red-700')}>
                      {o.etapa_actual==='Ganado'?<Trophy size={10}/>:<XCircle size={10}/>}{o.etapa_actual}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{o.nombre}</p>
                  {o.cliente&&<p className="text-xs text-gray-500 mt-0.5">{(o.cliente as {razon_social:string}).razon_social}</p>}
                  {o.etapa_actual==='Perdido'&&o.motivo_perdida&&<p className="text-xs text-red-600 mt-1">Motivo: {o.motivo_perdida}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  {(o.monto_final??o.monto_estimado)!=null&&<p className="text-sm font-bold text-crm-red">{'$'+(o.monto_final??o.monto_estimado!).toLocaleString('es-CL')}</p>}
                  {o.fecha_cierre_real&&<p className="text-xs text-gray-400 mt-0.5">{new Date(o.fecha_cierre_real).toLocaleDateString('es-CL')}</p>}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100">
                <p className="text-xs text-gray-400">
                  Vendedor: {o.vendedor ? `${(o.vendedor as {nombre:string;apellido:string}).nombre} ${(o.vendedor as {nombre:string;apellido:string}).apellido}` : '—'}
                </p>
              </div>
            </div>
          ))}</div>
        )}
      </div>
      {sel&&<OportunidadDrawer oportunidad={sel} onClose={()=>setSel(null)} onUpdate={()=>{setSel(null);load()}}/>}
    </div>
  )
}
