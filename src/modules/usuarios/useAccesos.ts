import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { syncPermisosCrm, syncPermisosLaChacra, syncRolNegocio } from '@/lib/syncPermisos'

export interface Acceso {
  id: string
  nombre: string
  apellido: string | null
  email: string
  activo: boolean
  isSuperAdmin: boolean
  rol: string
  laChacraRolNegocio: string
  laChacraModulos: string[]
  laChacraFinancieroEdit: Record<string, boolean>
  laChacraEstadosPagoAcciones: Record<string, boolean>
  laChacraLogisticaEdit: boolean
  crmRolNegocio: string
  crmModulos: string[]
}

export interface AccesoInput {
  nombre: string
  apellido: string
  email: string
  password?: string
  activo: boolean
  isSuperAdmin: boolean
  rol: string
  laChacraRolNegocio: string
  laChacraModulos: string[]
  laChacraFinancieroEdit: Record<string, boolean>
  laChacraEstadosPagoAcciones: Record<string, boolean>
  laChacraLogisticaEdit: boolean
  crmRolNegocio: string
  crmModulos: string[]
}

async function syncAccesos(userId: string, input: AccesoInput) {
  const accionesExtra = {
    ...Object.fromEntries(Object.entries(input.laChacraEstadosPagoAcciones).map(([accion, on]) => [`estados_pago:${accion}`, on])),
    'logistica:editar': input.laChacraLogisticaEdit,
  }
  await Promise.all([
    syncPermisosLaChacra(
      userId,
      Object.fromEntries(input.laChacraModulos.map((m) => [m, { access: true }])),
      input.laChacraFinancieroEdit,
      accionesExtra,
    ),
    syncPermisosCrm(userId, input.crmModulos),
    input.laChacraRolNegocio ? syncRolNegocio(userId, 'la-chacra', input.laChacraRolNegocio) : Promise.resolve(),
    input.crmRolNegocio ? syncRolNegocio(userId, 'crm', input.crmRolNegocio) : Promise.resolve(),
  ])
  const { error } = await supabase.from('profiles').update({ rol: input.rol }).eq('id', userId)
  if (error) throw new Error(error.message)
}

export function useAccesos() {
  const [accesos, setAccesos] = useState<Acceso[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    const [crmId, laChacraId] = await Promise.all([getProyectoId('crm'), getProyectoId('la-chacra')])
    const [{ data: profiles, error: profilesError }, { data: permisos }, { data: access }] = await Promise.all([
      supabase.from('profiles').select('id, nombre, apellido, email, activo, is_super_admin, rol').order('nombre'),
      supabase.from('permisos').select('user_id, proyecto_id, modulo_key, accion'),
      supabase.from('project_access').select('user_id, proyecto_id, rol_negocio'),
    ])
    if (profilesError) {
      setError(profilesError.message)
      setLoading(false)
      return
    }

    const mapped: Acceso[] = (profiles ?? []).map((p) => {
      const misPermisos = (permisos ?? []).filter((x) => x.user_id === p.id)
      const miAcceso = (access ?? []).filter((x) => x.user_id === p.id)
      const laChacraModulos = misPermisos.filter((x) => x.proyecto_id === laChacraId && x.accion === 'ver').map((x) => x.modulo_key)
      const laChacraFinancieroEdit: Record<string, boolean> = {}
      const laChacraEstadosPagoAcciones: Record<string, boolean> = {}
      let laChacraLogisticaEdit = false
      for (const x of misPermisos) {
        if (x.proyecto_id !== laChacraId) continue
        if (x.accion === 'editar' && x.modulo_key.startsWith('financiero:')) {
          laChacraFinancieroEdit[x.modulo_key.split(':')[1]] = true
        }
        if (x.modulo_key === 'estados_pago' && x.accion !== 'ver') {
          laChacraEstadosPagoAcciones[x.accion] = true
        }
        if (x.modulo_key === 'logistica' && x.accion === 'editar') {
          laChacraLogisticaEdit = true
        }
      }
      const crmModulos = misPermisos.filter((x) => x.proyecto_id === crmId && x.accion === 'ver').map((x) => x.modulo_key)
      return {
        id: p.id,
        nombre: p.nombre,
        apellido: p.apellido,
        email: p.email,
        activo: p.activo,
        isSuperAdmin: !!p.is_super_admin,
        rol: p.rol,
        laChacraRolNegocio: miAcceso.find((x) => x.proyecto_id === laChacraId)?.rol_negocio ?? '',
        laChacraModulos,
        laChacraFinancieroEdit,
        laChacraEstadosPagoAcciones,
        laChacraLogisticaEdit,
        crmRolNegocio: miAcceso.find((x) => x.proyecto_id === crmId)?.rol_negocio ?? '',
        crmModulos,
      }
    })
    setAccesos(mapped)
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const crear = useCallback(
    async (input: AccesoInput) => {
      const { data, error } = await supabase.functions.invoke('manage-access', {
        body: { action: 'create', nombre: input.nombre, apellido: input.apellido, email: input.email, password: input.password },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      const userId = data.id as string
      if (input.isSuperAdmin || !input.activo) {
        await supabase.functions.invoke('manage-access', {
          body: { action: 'update', userId, is_super_admin: input.isSuperAdmin, activo: input.activo },
        })
      }
      await syncAccesos(userId, input)
      await refetch()
    },
    [refetch],
  )

  const actualizar = useCallback(
    async (id: string, input: AccesoInput) => {
      const { error } = await supabase.functions.invoke('manage-access', {
        body: {
          action: 'update',
          userId: id,
          nombre: input.nombre,
          apellido: input.apellido,
          email: input.email,
          activo: input.activo,
          is_super_admin: input.isSuperAdmin,
        },
      })
      if (error) throw new Error(error.message)
      if (input.password) {
        const { error: pwError, data: pwData } = await supabase.functions.invoke('manage-access', {
          body: { action: 'reset_password', userId: id, password: input.password },
        })
        if (pwError) throw new Error(pwError.message)
        if (pwData?.error) throw new Error(pwData.error)
      }
      await syncAccesos(id, input)
      await refetch()
    },
    [refetch],
  )

  const eliminar = useCallback(
    async (id: string) => {
      const { data, error } = await supabase.functions.invoke('manage-access', { body: { action: 'delete', userId: id } })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      await refetch()
    },
    [refetch],
  )

  return { accesos, loading, error, crear, actualizar, eliminar }
}
