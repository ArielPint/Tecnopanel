import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, UserPlus, X, Building2, Clock, User } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/modules/crm/contexts/AuthContext'

interface Cliente {
  id: string; razon_social: string; rut: string; tipo: string; rubro: string
  direccion: string; ciudad: string; region: string
  contacto_nombre: string; contacto_email: string; contacto_fono: string
  notas: string; created_at: string
}
interface Contacto {
  id: string; cliente_id: string; nombre: string; cargo: string
  email: string; fono: string; observaciones: string
}
interface HistorialEntry {
  id: string; tipo: 'creacion' | 'modificacion'; created_at: string
  datos_antes: Record<string, unknown> | null
  datos_despues: Record<string, unknown> | null
  usuario?: { nombre: string; apellido: string } | null
}

const BLANK_CLIENTE = { razon_social:'', rut:'', tipo:'empresa', rubro:'', direccion:'', ciudad:'', region:'', contacto_nombre:'', contacto_email:'', contacto_fono:'', notas:'' }
const BLANK_CONTACTO = { nombre:'', cargo:'', email:'', fono:'', observaciones:'' }

const CAMPO_LABEL: Record<string, string> = {
  razon_social: 'Razón Social', rut: 'RUT', tipo: 'Tipo', rubro: 'Rubro',
  direccion: 'Dirección', ciudad: 'Ciudad', region: 'Región',
  contacto_nombre: 'Contacto', contacto_email: 'Email contacto',
  contacto_fono: 'Fono contacto', notas: 'Notas',
}

function diffCampos(antes: Record<string, unknown> | null, despues: Record<string, unknown> | null) {
  if (!antes || !despues) return []
  return Object.keys(despues).filter(k => String(antes[k] ?? '') !== String(despues[k] ?? ''))
}

export default function Clientes() {
  const { user } = useAuth()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [contactos, setContactos] = useState<Record<string, Contacto[]>>({})
  const [historiales, setHistoriales] = useState<Record<string, HistorialEntry[]>>({})
  const [showHistorial, setShowHistorial] = useState<string | null>(null)
  const [editCliente, setEditCliente] = useState<Cliente | null>(null)
  const [newCliente, setNewCliente] = useState(false)
  const [clienteForm, setClienteForm] = useState<typeof BLANK_CLIENTE>(BLANK_CLIENTE)
  const [editContacto, setEditContacto] = useState<Contacto | null>(null)
  const [newContacto, setNewContacto] = useState<string | null>(null)
  const [contactoForm, setContactoForm] = useState<typeof BLANK_CONTACTO>(BLANK_CONTACTO)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  async function load() {
    const { data } = await supabase.from('clientes').select('*').order('razon_social')
    setClientes((data as Cliente[]) || [])
    setLoading(false)
  }

  async function loadContactos(clienteId: string) {
    const { data } = await supabase.from('cliente_contactos').select('*').eq('cliente_id', clienteId).order('created_at')
    setContactos(prev => ({ ...prev, [clienteId]: (data as Contacto[]) || [] }))
  }

  async function loadHistorial(clienteId: string) {
    const { data } = await supabase
      .from('cliente_historial')
      .select('id,tipo,datos_antes,datos_despues,created_at,usuario_id')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .limit(20)

    const entries = (data as (HistorialEntry & { usuario_id: string | null })[]) || []

    // Cargar nombres de usuarios
    const uids = [...new Set(entries.map(e => e.usuario_id).filter(Boolean))]
    let userMap: Record<string, { nombre: string; apellido: string }> = {}
    if (uids.length) {
      const { data: profiles } = await supabase.from('profiles').select('id,nombre,apellido').in('id', uids)
      userMap = Object.fromEntries((profiles || []).map((p: { id: string; nombre: string; apellido: string }) => [p.id, p]))
    }

    setHistoriales(prev => ({
      ...prev,
      [clienteId]: entries.map(e => ({ ...e, usuario: e.usuario_id ? userMap[e.usuario_id] ?? null : null })),
    }))
  }

  useEffect(() => { load() }, [])

  async function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!contactos[id]) await loadContactos(id)
    if (!historiales[id]) await loadHistorial(id)
  }

  async function registrarHistorial(clienteId: string, tipo: 'creacion' | 'modificacion', datosAntes: object | null, datosDespues: object) {
    await supabase.from('cliente_historial').insert({
      cliente_id: clienteId,
      usuario_id: user?.id ?? null,
      tipo,
      datos_antes: datosAntes,
      datos_despues: datosDespues,
    })
  }

  async function saveCliente() {
    setSaving(true)
    if (editCliente) {
      await supabase.from('clientes').update(clienteForm).eq('id', editCliente.id)
      await registrarHistorial(editCliente.id, 'modificacion', {
        razon_social: editCliente.razon_social, rut: editCliente.rut, tipo: editCliente.tipo,
        rubro: editCliente.rubro, direccion: editCliente.direccion, ciudad: editCliente.ciudad,
        region: editCliente.region, contacto_nombre: editCliente.contacto_nombre,
        contacto_email: editCliente.contacto_email, contacto_fono: editCliente.contacto_fono,
        notas: editCliente.notas,
      }, clienteForm)
      // Refrescar historial si está visible
      if (expanded === editCliente.id) await loadHistorial(editCliente.id)
    } else {
      const { data } = await supabase.from('clientes').insert(clienteForm).select('id').single()
      if (data) await registrarHistorial(data.id, 'creacion', null, clienteForm)
    }
    setSaving(false); setEditCliente(null); setNewCliente(false); load()
  }

  async function deleteCliente(id: string) {
    if (!confirm('¿Eliminar este cliente?')) return
    await supabase.from('clientes').delete().eq('id', id)
    setExpanded(null); load()
  }

  async function saveContacto() {
    setSaving(true)
    if (editContacto) {
      await supabase.from('cliente_contactos').update(contactoForm).eq('id', editContacto.id)
      await loadContactos(editContacto.cliente_id)
    } else if (newContacto) {
      await supabase.from('cliente_contactos').insert({ ...contactoForm, cliente_id: newContacto })
      await loadContactos(newContacto)
    }
    setSaving(false); setEditContacto(null); setNewContacto(null)
  }

  async function deleteContacto(c: Contacto) {
    if (!confirm('¿Eliminar este contacto?')) return
    await supabase.from('cliente_contactos').delete().eq('id', c.id)
    await loadContactos(c.cliente_id)
  }

  function openEditCliente(c: Cliente) {
    setClienteForm({ razon_social:c.razon_social, rut:c.rut, tipo:c.tipo, rubro:c.rubro||'', direccion:c.direccion||'', ciudad:c.ciudad||'', region:c.region||'', contacto_nombre:c.contacto_nombre||'', contacto_email:c.contacto_email||'', contacto_fono:c.contacto_fono||'', notas:c.notas||'' })
    setEditCliente(c); setNewCliente(false)
  }

  function openNewCliente() { setClienteForm(BLANK_CLIENTE); setNewCliente(true); setEditCliente(null) }

  function openEditContacto(c: Contacto) {
    setContactoForm({ nombre:c.nombre, cargo:c.cargo||'', email:c.email||'', fono:c.fono||'', observaciones:c.observaciones||'' })
    setEditContacto(c); setNewContacto(null)
  }

  function openNewContacto(clienteId: string) {
    setContactoForm(BLANK_CONTACTO); setNewContacto(clienteId); setEditContacto(null)
  }

  function formatFecha(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric' }) +
      ' ' + d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' })
  }

  const filtered = clientes.filter(c =>
    c.razon_social.toLowerCase().includes(search.toLowerCase()) ||
    c.rut?.includes(search) ||
    c.ciudad?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-crm-red border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-gray-200 bg-white flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-lg font-bold text-gray-800">Clientes</h1><p className="text-xs text-gray-500">{clientes.length} clientes registrados</p></div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="flex-1 sm:w-52 sm:flex-none border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/>
          <button onClick={openNewCliente} className="flex items-center gap-2 px-3 py-2 bg-crm-red text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex-shrink-0"><Plus size={16}/><span className="hidden sm:inline">Nuevo cliente</span><span className="sm:hidden">Nuevo</span></button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-6 space-y-3">
        {filtered.map(c => (
          <div key={c.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {/* Row */}
            <div className="flex items-center gap-4 px-4 py-3">
              <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0"><Building2 size={18} className="text-crm-red"/></div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 text-sm truncate">{c.razon_social}</p>
                <p className="text-xs text-gray-400">{c.rut} {c.ciudad ? '· '+c.ciudad : ''} {c.rubro ? '· '+c.rubro : ''}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEditCliente(c)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="Editar"><Pencil size={14}/></button>
                <button onClick={() => deleteCliente(c.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Eliminar"><Trash2 size={14}/></button>
                <button onClick={() => toggleExpand(c.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 ml-1">
                  {expanded === c.id ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                </button>
              </div>
            </div>

            {/* Expanded */}
            {expanded === c.id && (
              <div className="border-t border-gray-100 bg-gray-50">
                {/* Contactos */}
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contactos</p>
                    <button onClick={() => openNewContacto(c.id)} className="flex items-center gap-1 text-xs text-crm-red hover:text-red-700 font-medium"><UserPlus size={13}/>Agregar contacto</button>
                  </div>
                  {c.contacto_nombre && (
                    <div className="bg-white rounded-lg px-3 py-2 mb-2 border border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-[10px] font-bold text-crm-red">{c.contacto_nombre[0]?.toUpperCase()}</div>
                        <div>
                          <p className="text-xs font-medium text-gray-700">{c.contacto_nombre} <span className="text-gray-400 font-normal">(Principal)</span></p>
                          <p className="text-[11px] text-gray-400">{[c.contacto_email, c.contacto_fono].filter(Boolean).join(' · ')}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {(contactos[c.id] || []).map(ct => (
                    <div key={ct.id} className="bg-white rounded-lg px-3 py-2 mb-2 border border-gray-100">
                      <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600 flex-shrink-0 mt-0.5">{ct.nombre[0]?.toUpperCase()}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-700">{ct.nombre}{ct.cargo ? <span className="text-gray-400 font-normal"> · {ct.cargo}</span> : ''}</p>
                          <p className="text-[11px] text-gray-400">{[ct.email, ct.fono].filter(Boolean).join(' · ')}</p>
                          {ct.observaciones && <p className="text-[11px] text-gray-500 mt-1 italic">"{ct.observaciones}"</p>}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => openEditContacto(ct)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><Pencil size={12}/></button>
                          <button onClick={() => deleteContacto(ct)} className="p-1 rounded hover:bg-red-50 text-red-400"><Trash2 size={12}/></button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(contactos[c.id] || []).length === 0 && !c.contacto_nombre && (
                    <p className="text-xs text-gray-400 text-center py-2">Sin contactos registrados</p>
                  )}
                  {c.notas && <div className="mt-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-100"><p className="text-xs text-amber-700 italic">{c.notas}</p></div>}
                </div>

                {/* Historial */}
                <div className="border-t border-gray-100 px-4 py-3">
                  <button
                    onClick={() => setShowHistorial(showHistorial === c.id ? null : c.id)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700 transition-colors"
                  >
                    <Clock size={12}/>
                    Historial de cambios
                    {showHistorial === c.id ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                    {historiales[c.id]?.length > 0 && (
                      <span className="ml-1 bg-gray-200 text-gray-600 text-[10px] px-1.5 py-0.5 rounded-full font-medium">{historiales[c.id].length}</span>
                    )}
                  </button>

                  {showHistorial === c.id && (
                    <div className="mt-3 space-y-2">
                      {!historiales[c.id] || historiales[c.id].length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-2">Sin registros de historial</p>
                      ) : historiales[c.id].map(h => {
                        const cambios = h.tipo === 'modificacion' ? diffCampos(h.datos_antes, h.datos_despues) : []
                        return (
                          <div key={h.id} className="bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-1.5">
                                {h.tipo === 'creacion'
                                  ? <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">Creación</span>
                                  : <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">Modificación</span>}
                                {h.usuario && (
                                  <span className="flex items-center gap-1 text-[11px] text-gray-500">
                                    <User size={10}/>{h.usuario.nombre} {h.usuario.apellido}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-gray-400 flex-shrink-0">{formatFecha(h.created_at)}</span>
                            </div>
                            {h.tipo === 'modificacion' && cambios.length > 0 && (
                              <div className="mt-1.5 space-y-1">
                                {cambios.map(campo => (
                                  <div key={campo} className="flex items-start gap-1.5 text-[11px]">
                                    <span className="text-gray-400 font-medium min-w-[90px]">{CAMPO_LABEL[campo] ?? campo}:</span>
                                    <span className="text-red-400 line-through">{String(h.datos_antes?.[campo] || '—')}</span>
                                    <span className="text-gray-300 mx-0.5">→</span>
                                    <span className="text-green-600">{String(h.datos_despues?.[campo] || '—')}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {h.tipo === 'creacion' && (
                              <p className="text-[11px] text-gray-400 mt-1">Cliente creado en el sistema</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center text-gray-400 py-12 text-sm">No se encontraron clientes</div>}
      </div>

      {/* Modal Cliente */}
      {(editCliente || newCliente) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-base font-bold text-gray-800">{editCliente ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <button onClick={() => { setEditCliente(null); setNewCliente(false) }} className="p-1.5 rounded hover:bg-gray-100"><X size={16}/></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2"><label className="text-xs font-medium text-gray-600 block mb-1">Razón Social *</label><input value={clienteForm.razon_social} onChange={e => setClienteForm(f => ({ ...f, razon_social: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
                <div><label className="text-xs font-medium text-gray-600 block mb-1">RUT</label><input value={clienteForm.rut} onChange={e => setClienteForm(f => ({ ...f, rut: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
                <div><label className="text-xs font-medium text-gray-600 block mb-1">Tipo</label>
                  <select value={clienteForm.tipo} onChange={e => setClienteForm(f => ({ ...f, tipo: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red">
                    <option value="empresa">Empresa</option><option value="persona">Persona</option><option value="gobierno">Gobierno</option>
                  </select>
                </div>
                <div><label className="text-xs font-medium text-gray-600 block mb-1">Rubro</label><input value={clienteForm.rubro} onChange={e => setClienteForm(f => ({ ...f, rubro: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
                <div><label className="text-xs font-medium text-gray-600 block mb-1">Ciudad</label><input value={clienteForm.ciudad} onChange={e => setClienteForm(f => ({ ...f, ciudad: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
                <div className="sm:col-span-2"><label className="text-xs font-medium text-gray-600 block mb-1">Dirección</label><input value={clienteForm.direccion} onChange={e => setClienteForm(f => ({ ...f, direccion: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
              </div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">Contacto principal</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2"><label className="text-xs font-medium text-gray-600 block mb-1">Nombre</label><input value={clienteForm.contacto_nombre} onChange={e => setClienteForm(f => ({ ...f, contacto_nombre: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
                <div><label className="text-xs font-medium text-gray-600 block mb-1">Email</label><input value={clienteForm.contacto_email} onChange={e => setClienteForm(f => ({ ...f, contacto_email: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
                <div><label className="text-xs font-medium text-gray-600 block mb-1">Teléfono</label><input value={clienteForm.contacto_fono} onChange={e => setClienteForm(f => ({ ...f, contacto_fono: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
              </div>
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Notas</label><textarea value={clienteForm.notas} onChange={e => setClienteForm(f => ({ ...f, notas: e.target.value }))} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red resize-none"/></div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => { setEditCliente(null); setNewCliente(false) }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={saveCliente} disabled={saving || !clienteForm.razon_social} className="px-4 py-2 text-sm bg-crm-red text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Contacto */}
      {(editContacto || newContacto) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-800">{editContacto ? 'Editar contacto' : 'Nuevo contacto'}</h2>
              <button onClick={() => { setEditContacto(null); setNewContacto(null) }} className="p-1.5 rounded hover:bg-gray-100"><X size={16}/></button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Nombre *</label><input value={contactoForm.nombre} onChange={e => setContactoForm(f => ({ ...f, nombre: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-gray-600 block mb-1">Cargo</label><input value={contactoForm.cargo} onChange={e => setContactoForm(f => ({ ...f, cargo: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
                <div><label className="text-xs font-medium text-gray-600 block mb-1">Teléfono</label><input value={contactoForm.fono} onChange={e => setContactoForm(f => ({ ...f, fono: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
              </div>
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Email</label><input value={contactoForm.email} onChange={e => setContactoForm(f => ({ ...f, email: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red"/></div>
              <div><label className="text-xs font-medium text-gray-600 block mb-1">Observaciones</label><textarea value={contactoForm.observaciones} onChange={e => setContactoForm(f => ({ ...f, observaciones: e.target.value }))} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-red resize-none"/></div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => { setEditContacto(null); setNewContacto(null) }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={saveContacto} disabled={saving || !contactoForm.nombre} className="px-4 py-2 text-sm bg-crm-red text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
