import { useEffect, useState } from 'react'
import { Clock, User } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { Oportunidad } from '@/modules/crm/types/database'
import OportunidadDrawer from '@/modules/crm/components/OportunidadDrawer'
import { handleSupabaseError } from '@/modules/crm/lib/errors'

const TC:Record<string,string>={Proyecto:'bg-purple-100 text-purple-700',Producto:'bg-blue-100 text-blue-700',Kit:'bg-amber-100 text-amber-700'}
interface OE extends Oportunidad{asignado?:{nombre:string;apellido:string}|null;dias?:number}

export default function Presupuestos(){
  const [opps,setOpps]=useState<OE[]>([])
  const [loading,setLoading]=useState(true)
  const [sel,setSel]=useState<Oportunidad|null>(null)
  async function load(){
    const {data,error}=await supabase.from('oportunidades').select('*,cliente:clientes(razon_social,rut),vendedor:profiles(nombre,apellido)').eq('etapa_actual','Presupuestos').order('updated_at',{ascending:false})
    handleSupabaseError(error,'Presupuestos.load')
    const base=(data as Oportunidad[])||[]
    if(!base.length){setOpps([]);setLoading(false);return}
    const ids=base.map(o=>o.id)
    const [{data:asigs,error:asigsErr},{data:hist,error:histErr}]=await Promise.all([
      supabase.from('oportunidad_asignaciones').select('oportunidad_id,usuario_id').in('oportunidad_id',ids).eq('etapa','Presupuestos'),
      supabase.from('oportunidad_historial_etapas').select('oportunidad_id,fecha_entrada').in('oportunidad_id',ids).eq('etapa','Presupuestos').is('fecha_salida',null),
    ])
    handleSupabaseError(asigsErr,'Presupuestos.load.asignaciones')
    handleSupabaseError(histErr,'Presupuestos.load.historial')
    const am:Record<string,{nombre:string;apellido:string}>={};const dm:Record<string,number>={}
    const userIds=[...new Set((asigs||[]).map((a:any)=>a.usuario_id).filter(Boolean))]
    if(userIds.length){
      const {data:users,error:usersErr}=await supabase.from('profiles').select('id,nombre,apellido').in('id',userIds)
      handleSupabaseError(usersErr,'Presupuestos.load.profiles')
      const um:Record<string,{nombre:string;apellido:string}>=Object.fromEntries((users||[]).map(u=>[u.id,u]))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(asigs||[]).forEach((a:any)=>{if(um[a.usuario_id])am[a.oportunidad_id]=um[a.usuario_id]})
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(hist||[]).forEach((h:any)=>{dm[h.oportunidad_id]=Math.floor((Date.now()-new Date(h.fecha_entrada).getTime())/86400000)})
    setOpps(base.map(o=>({...o,asignado:am[o.id]??null,dias:dm[o.id]??0})));setLoading(false)
  }
  useEffect(()=>{load()},[])
  if(loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-crm-red border-t-transparent rounded-full animate-spin"/></div>
  return(
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <p className="text-xs text-gray-500 mb-4">{opps.length} oportunidades</p>
        {opps.length===0?(<div className="flex flex-col items-center justify-center h-64 text-gray-400"><p className="text-sm">Sin oportunidades en esta etapa</p></div>):(
          <div className="space-y-3 max-w-3xl">{opps.map(o=>(
            <div key={o.id} onClick={()=>setSel(o)} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-red-200 transition-all cursor-pointer">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1"><span className="text-xs text-gray-400 font-mono">{o.codigo}</span><span className={'text-xs px-1.5 py-0.5 rounded-full font-medium '+(TC[o.tipo_venta]??'bg-gray-100 text-gray-600')}>{o.tipo_venta}</span></div>
                  <p className="text-sm font-semibold text-gray-800">{o.nombre}</p>
                  {o.cliente&&<p className="text-xs text-gray-500 mt-0.5">{(o.cliente as {razon_social:string}).razon_social}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  {o.monto_estimado!=null&&<p className="text-sm font-bold text-crm-red">{'$'+o.monto_estimado.toLocaleString('es-CL')}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">{o.probabilidad??0}%</p>
                  {o.dias!==undefined&&<div className="flex items-center justify-end gap-1 mt-1"><Clock size={10} className="text-gray-400"/><span className="text-xs text-gray-400">{o.dias}d</span></div>}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                <p className="text-xs text-gray-400">Vendedor: {o.vendedor ? `${(o.vendedor as {nombre:string;apellido:string}).nombre} ${(o.vendedor as {nombre:string;apellido:string}).apellido}` : '—'}</p>
                <p className="text-xs font-medium flex items-center gap-1 text-blue-500"><User size={10}/>{o.asignado ? `${o.asignado.nombre} ${o.asignado.apellido}` : 'Sin asignar'}</p>
              </div>
            </div>
          ))}</div>
        )}
      </div>
      {sel&&<OportunidadDrawer oportunidad={sel} onClose={()=>setSel(null)} onUpdate={()=>{setSel(null);load()}}/>}
    </div>
  )
}
