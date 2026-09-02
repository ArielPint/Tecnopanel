import { useEffect, useState } from 'react'
import { Clock, User, Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { Oportunidad, Profile, TareaIngenieria } from '@/modules/crm/types/database'
import OportunidadDrawer from '@/modules/crm/components/OportunidadDrawer'
import { handleSupabaseError } from '@/modules/crm/lib/errors'
import { useAuth } from '@/modules/crm/contexts/AuthContext'

const TIPO_COLOR: Record<string,string>={Proyecto:'bg-purple-100 text-purple-700',Producto:'bg-blue-100 text-blue-700',Kit:'bg-amber-100 text-amber-700'}
interface OE extends Oportunidad{asignado?:{nombre:string;apellido:string}|null;diasEtapa?:number}
interface TareaConOportunidad extends TareaIngenieria{oportunidad?:{codigo:string;nombre:string}|null}

export default function Ingenieria(){
  const { profile } = useAuth()
  const puedeBuscarPorUsuario = profile?.rol === 'jefe_ingenieria' || profile?.rol === 'admin'
  const [opps,setOpps]=useState<OE[]>([])
  const [loading,setLoading]=useState(true)
  const [sel,setSel]=useState<Oportunidad|null>(null)
  const [usuarios,setUsuarios]=useState<Profile[]>([])
  const [busquedaUsuario,setBusquedaUsuario]=useState('')
  const [usuarioSel,setUsuarioSel]=useState<Profile|null>(null)
  const [oppsAsignadas,setOppsAsignadas]=useState<OE[]>([])
  const [tareasAsignadas,setTareasAsignadas]=useState<TareaConOportunidad[]>([])
  const [buscando,setBuscando]=useState(false)

  async function load(){
    const {data,error}=await supabase.from('oportunidades').select('*,cliente:clientes(razon_social),vendedor:profiles(nombre,apellido)').eq('etapa_actual','Ingeniería').neq('tipo_venta','VIT').order('updated_at',{ascending:false})
    handleSupabaseError(error,'Ingenieria.load')
    const base=(data as Oportunidad[])||[]
    if(!base.length){setOpps([]);setLoading(false);return}
    const ids=base.map(o=>o.id)
    const [{data:asigs,error:asigsErr},{data:hist,error:histErr}]=await Promise.all([
      supabase.from('oportunidad_asignaciones').select('oportunidad_id,usuario_id').in('oportunidad_id',ids).eq('etapa','Ingeniería'),
      supabase.from('oportunidad_historial_etapas').select('oportunidad_id,fecha_entrada').in('oportunidad_id',ids).eq('etapa','Ingeniería').is('fecha_salida',null),
    ])
    handleSupabaseError(asigsErr,'Ingenieria.load.asignaciones')
    handleSupabaseError(histErr,'Ingenieria.load.historial')
    const am:Record<string,{nombre:string;apellido:string}>={}
    const dm:Record<string,number>={}
    const userIds=[...new Set((asigs||[]).map((a:any)=>a.usuario_id).filter(Boolean))]
    if(userIds.length){
      const {data:users,error:usersErr}=await supabase.from('profiles').select('id,nombre,apellido').in('id',userIds)
      handleSupabaseError(usersErr,'Ingenieria.load.profiles')
      const um:Record<string,{nombre:string;apellido:string}>=Object.fromEntries((users||[]).map(u=>[u.id,u]))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(asigs||[]).forEach((a:any)=>{if(um[a.usuario_id])am[a.oportunidad_id]=um[a.usuario_id]})
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(hist||[]).forEach((h:any)=>{dm[h.oportunidad_id]=Math.floor((Date.now()-new Date(h.fecha_entrada).getTime())/86400000)})
    setOpps(base.map(o=>({...o,asignado:am[o.id]??null,diasEtapa:dm[o.id]??0})))
    setLoading(false)
  }
  useEffect(()=>{load()},[])

  useEffect(()=>{
    if(!puedeBuscarPorUsuario) return
    supabase.from('profiles').select('id,nombre,apellido,rol').eq('activo',true).in('rol',['ingeniero','jefe_ingenieria']).order('nombre')
      .then(({data,error})=>{handleSupabaseError(error,'Ingenieria.load.usuarios');setUsuarios((data as Profile[])||[])})
  },[puedeBuscarPorUsuario])

  async function buscarPorUsuario(u:Profile){
    setUsuarioSel(u);setBuscando(true)
    const [{data:asigOpp,error:asigOppErr},{data:asigTareas,error:asigTareasErr}]=await Promise.all([
      supabase.from('oportunidad_asignaciones').select('oportunidad_id').eq('usuario_id',u.id),
      supabase.from('tarea_asignaciones').select('tarea_id').eq('usuario_id',u.id),
    ])
    handleSupabaseError(asigOppErr,'Ingenieria.buscarPorUsuario.oportunidades')
    handleSupabaseError(asigTareasErr,'Ingenieria.buscarPorUsuario.tareas')
    const oppIds=[...new Set((asigOpp||[]).map(a=>a.oportunidad_id))]
    const tareaIds=[...new Set((asigTareas||[]).map(a=>a.tarea_id))]
    const [oppsRes,tareasRes]=await Promise.all([
      oppIds.length?supabase.from('oportunidades').select('*,cliente:clientes(razon_social)').in('id',oppIds):Promise.resolve({data:[],error:null}),
      tareaIds.length?supabase.from('tareas_ingenieria').select('*,oportunidad:oportunidades(codigo,nombre)').in('id',tareaIds):Promise.resolve({data:[],error:null}),
    ])
    handleSupabaseError(oppsRes.error,'Ingenieria.buscarPorUsuario.oportunidades.detalle')
    handleSupabaseError(tareasRes.error,'Ingenieria.buscarPorUsuario.tareas.detalle')
    setOppsAsignadas((oppsRes.data as OE[])||[])
    setTareasAsignadas((tareasRes.data as TareaConOportunidad[])||[])
    setBuscando(false)
  }

  function limpiarBusqueda(){setUsuarioSel(null);setBusquedaUsuario('');setOppsAsignadas([]);setTareasAsignadas([])}

  const sugerencias=busquedaUsuario.trim()
    ? usuarios.filter(u=>`${u.nombre} ${u.apellido}`.toLowerCase().includes(busquedaUsuario.toLowerCase()))
    : []

  if(loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-crm-red border-t-transparent rounded-full animate-spin"/></div>
  return(
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {puedeBuscarPorUsuario && (
          <div className="mb-4 max-w-md">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={usuarioSel?`${usuarioSel.nombre} ${usuarioSel.apellido}`:busquedaUsuario}
                onChange={e=>{setBusquedaUsuario(e.target.value);if(usuarioSel)setUsuarioSel(null)}}
                placeholder="Buscar por usuario (tareas y proyectos asignados)..."
                className="w-full pl-8 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-crm-red" />
              {(usuarioSel||busquedaUsuario) && (
                <button onClick={limpiarBusqueda} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14}/></button>
              )}
            </div>
            {!usuarioSel && sugerencias.length>0 && (
              <div className="mt-1 border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
                {sugerencias.map(u=>(
                  <button key={u.id} onClick={()=>buscarPorUsuario(u)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    {u.nombre} {u.apellido}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {usuarioSel ? (
          <div className="space-y-6 max-w-3xl">
            {buscando ? (
              <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-2 border-crm-red border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">Proyectos asignados a {usuarioSel.nombre} {usuarioSel.apellido} ({oppsAsignadas.length})</p>
                  {oppsAsignadas.length===0?<p className="text-xs text-gray-400">Sin proyectos asignados</p>:(
                    <div className="space-y-2">{oppsAsignadas.map(o=>(
                      <div key={o.id} onClick={()=>setSel(o)} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow-md hover:border-red-200 transition-all cursor-pointer">
                        <div className="flex items-center gap-2 mb-1"><span className="text-xs text-gray-400 font-mono">{o.codigo}</span><span className="text-xs bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5">{o.etapa_actual}</span></div>
                        <p className="text-sm font-semibold text-gray-800">{o.nombre}</p>
                      </div>
                    ))}</div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">Tareas asignadas ({tareasAsignadas.length})</p>
                  {tareasAsignadas.length===0?<p className="text-xs text-gray-400">Sin tareas asignadas</p>:(
                    <div className="space-y-1.5">{tareasAsignadas.map(t=>(
                      <div key={t.id} className="flex items-center justify-between gap-2 p-2 bg-white border border-slate-200 rounded-lg">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-700 truncate">{t.titulo}</p>
                          <p className="text-xs text-gray-400 truncate">{t.oportunidad ? `${t.oportunidad.codigo} · ${t.oportunidad.nombre}` : '—'}{t.fecha_limite?' · vence '+new Date(t.fecha_limite).toLocaleDateString('es-CL'):''}</p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">{t.estado.replace(/_/g,' ')}</span>
                      </div>
                    ))}</div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
        <>
        <p className="text-xs text-gray-500 mb-4">{opps.length} oportunidades</p>
        {opps.length===0?(<div className="flex flex-col items-center justify-center h-64 text-gray-400"><p className="text-sm">Sin oportunidades en esta etapa</p></div>):(
          <div className="space-y-3 max-w-3xl">{opps.map(o=>(
            <div key={o.id} onClick={()=>setSel(o)} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-red-200 transition-all cursor-pointer">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1"><span className="text-xs text-gray-400 font-mono">{o.codigo}</span><span className={'text-xs px-1.5 py-0.5 rounded-full font-medium '+(TIPO_COLOR[o.tipo_venta]??'bg-gray-100 text-gray-600')}>{o.tipo_venta}</span></div>
                  <p className="text-sm font-semibold text-gray-800">{o.nombre}</p>
                  {o.cliente&&<p className="text-xs text-gray-500 mt-0.5">{(o.cliente as {razon_social:string}).razon_social}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  {o.monto_estimado!=null&&<p className="text-sm font-bold text-crm-red">{'$'+o.monto_estimado.toLocaleString('es-CL')}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">{o.probabilidad??0}%</p>
                  {o.diasEtapa!==undefined&&<div className="flex items-center justify-end gap-1 mt-1"><Clock size={10} className="text-gray-400"/><span className="text-xs text-gray-400">{o.diasEtapa}d</span></div>}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Vendedor: {o.vendedor ? `${(o.vendedor as {nombre:string;apellido:string}).nombre} ${(o.vendedor as {nombre:string;apellido:string}).apellido}` : '—'}
                </p>
                <p className="text-xs font-medium flex items-center gap-1 text-blue-500">
                  <User size={10}/>
                  {o.asignado ? `${o.asignado.nombre} ${o.asignado.apellido}` : 'Sin asignar'}
                </p>
              </div>
            </div>
          ))}</div>
        )}
        </>
        )}
      </div>
      {sel&&<OportunidadDrawer oportunidad={sel} onClose={()=>setSel(null)} onUpdate={()=>{setSel(null);load()}}/>}
    </div>
  )
}
