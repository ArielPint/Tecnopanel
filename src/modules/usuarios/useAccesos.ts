import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { syncPermisosCrm, syncPermisosProyecto, syncRolNegocio } from '@/lib/syncPermisos'

export interface ProyectoObra {
  id: string
  nombre: string
  slug: string
}

export interface ProyectoAcceso {
  rolNegocio: string
  modulos: string[]
  financieroEdit: Record<string, boolean>
  estadosPagoAcciones: Record<string, boolean>
  logisticaEdit: boolean
}

export function proyectoAccesoVacio(): ProyectoAcceso {
  return { rolNegocio: '', modulos: [], financieroEdit: {}, estadosPagoAcciones: {}, logisticaEdit: false }
}

export interface Acceso {
  id: string
  nombre: string
  apellido: string | null
  email: string
  activo: boolean
  isSuperAdmin: boolean
  rol: string
  proyectos: Record<string, ProyectoAcceso>
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
  proyectos: Record<string, ProyectoAcceso>
  crmRolNegocio: string
  crmModulos: string[]
}

async function syncAccesos(userId: string, input: AccesoInput) {
  const syncsProyectos = Object.entries(input.proyectos).flatMap(([proyectoId, pa]) => {
    const accionesExtra = {
      ...Object.fromEntries(Object.entries(pa.estadosPagoAcciones).map(([accion, on]) => [`estados_pago:${accion}`, on])),
      'logistica:editar': pa.logisticaEdit,
    }
    return [
      syncPermisosProyecto(
        userId,
        proyectoId,
        Object.fromEntries(pa.modulos.map((m) => [m, { access: true }])),
        pa.financieroEdit,
        accionesExtra,
      ),
      pa.rolNegocio ? syncRolNegocio(userId, proyectoId, pa.rolNegocio) : Promise.resolve(),
    ]
  })
  const crmId = await getProyectoId('crm')
  await Promise.all([
    ...syncsProyectos,
    syncPermisosCrm(userId, input.crmModulos),
    input.crmRolNegocio ? syncRolNegocio(userId, crmId, input.crmRolNegocio) : Promise.resolve(),
  ])
  const { error } = await supabase.from('profiles').update({ rol: input.rol }).eq('id', userId)
  if (error) throw new Error(error.message)
}

export function useAccesos() {
  const [accesos, setAccesos] = useState<Acceso[]>([])
  const [proyectosObra, setProyectosObra] = useState<ProyectoObra[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    const [{ data: obras }, crmId] = await Promise.all([
      // Fase F: cualquier proyecto tipo obra, no solo La Chacra — mismo criterio que useAccesoUsuario.
      supabase.from('proyectos').select('id, nombre, slug').neq('tipo', 'crm').order('nombre'),
      getProyectoId('crm'),
    ])
    const proyectosObraLista: ProyectoObra[] = obras ?? []
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

      const proyectos: Record<string, ProyectoAcceso> = {}
      for (const proy of proyectosObraLista) {
        const modulos = misPermisos.filter((x) => x.proyecto_id === proy.id && x.accion === 'ver').map((x) => x.modulo_key)
        const financieroEdit: Record<string, boolean> = {}
        const estadosPagoAcciones: Record<string, boolean> = {}
        let logisticaEdit = false
        for (const x of misPermisos) {
          if (x.proyecto_id !== proy.id) continue
          if (x.accion === 'editar' && x.modulo_key.startsWith('financiero:')) {
            financieroEdit[x.modulo_key.split(':')[1]] = true
          }
          if (x.modulo_key === 'estados_pago' && x.accion !== 'ver') {
            estadosPagoAcciones[x.accion] = true
          }
          if (x.modulo_key === 'logistica' && x.accion === 'editar') {
            logisticaEdit = true
          }
        }
        proyectos[proy.id] = {
          rolNegocio: miAcceso.find((x) => x.proyecto_id === proy.id)?.rol_negocio ?? '',
          modulos,
          financieroEdit,
          estadosPagoAcciones,
          logisticaEdit,
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
        proyectos,
        crmRolNegocio: miAcceso.find((x) => x.proyecto_id === crmId)?.rol_negocio ?? '',
        crmModulos,
      }
    })
    setAccesos(mapped)
    setProyectosObra(proyectosObraLista)
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

  return { accesos, proyectosObra, loading, error, crear, actualizar, eliminar }
}
