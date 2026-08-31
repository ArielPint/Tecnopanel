import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getProyectoId } from '@/lib/proyectoIds'
import { syncPermisosCrm, syncPermisosGestion, syncPermisosProyecto, syncRolNegocio } from '@/lib/syncPermisos'

export interface ProyectoObra {
  id: string
  nombre: string
  slug: string
}

export interface ProyectoAcceso {
  rolNegocio: string
  modulos: string[]
  tabs: Record<string, string[]>
  financieroEdit: Record<string, boolean>
  estadosPagoAcciones: Record<string, boolean>
  estadosPagoIngresosAcciones: Record<string, boolean>
  logisticaEdit: boolean
  solicitudesEdit: boolean
  /** Puede agregar y editar productos del catálogo desde la pestaña Solicitudes,
   * sin necesitar logistica:editar (independiente de solicitudesEdit). */
  solicitudesCatalogoCrearEditar: boolean
  /** Puede ocultar/eliminar productos del catálogo desde la pestaña Solicitudes,
   * sin necesitar logistica:editar (independiente de solicitudesEdit). */
  solicitudesCatalogoEliminar: boolean
  /** Subcontrato asociado (WEDO/CONBES) — si está seteado, Producción y Avance Obra
   * filtran los módulos a solo los de ese subcontrato para este usuario. */
  subcontrato: 'WEDO' | 'CONBES' | ''
}

export function proyectoAccesoVacio(): ProyectoAcceso {
  return {
    rolNegocio: '',
    modulos: [],
    tabs: {},
    financieroEdit: {},
    estadosPagoAcciones: {},
    estadosPagoIngresosAcciones: {},
    logisticaEdit: false,
    solicitudesEdit: false,
    solicitudesCatalogoCrearEditar: false,
    solicitudesCatalogoEliminar: false,
    subcontrato: '',
  }
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
  /** Acciones granulares CRM (crear/editar/eliminar/exportar), clave "Módulo:accion" — ver CRM_ACCION_GROUPS. */
  crmAcciones: Record<string, boolean>
  /** Acceso al módulo Gestión (§3.6) — permisos(modulo_key='gestion', accion='ver'), no es un proyecto. */
  gestionVer: boolean
  /** Grupo fijo (profiles.grupo_id) para acceso restringido a Solicitudes — un único grupo, no por proyecto. */
  grupoId: number | null
  /** Ficha de subcontratista vinculada — si tiene valor, este usuario es el portal de ese subcontratista. */
  subcontratistaId: string | null
  /** Sucursal del usuario (F1). Opcional; el bloqueo real por sucursal llega en F2. */
  sucursal: string | null
  ultimoIngreso: string | null
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
  crmAcciones: Record<string, boolean>
  gestionVer: boolean
  grupoId: number | null
  subcontratistaId: string | null
  sucursal: string | null
}

// Vincula (o desvincula) la ficha de subcontratista con este usuario — desvincula
// primero cualquier ficha que tuviera este user_id antes, por si cambió la selección.
async function syncSubcontratistaLink(userId: string, subcontratistaId: string | null) {
  const { error: unlinkErr } = await supabase.from('subcontratistas').update({ user_id: null }).eq('user_id', userId)
  if (unlinkErr) throw new Error(unlinkErr.message)
  if (!subcontratistaId) return
  const { error } = await supabase.from('subcontratistas').update({ user_id: userId }).eq('id', subcontratistaId)
  if (error) throw new Error(error.message)
}

async function syncAccesos(userId: string, input: AccesoInput) {
  const syncsProyectos = Object.entries(input.proyectos).flatMap(([proyectoId, pa]) => {
    const accionesExtra = {
      ...Object.fromEntries(Object.entries(pa.estadosPagoAcciones).map(([accion, on]) => [`estados_pago:${accion}`, on])),
      ...Object.fromEntries(Object.entries(pa.estadosPagoIngresosAcciones).map(([accion, on]) => [`estados_pago_ingresos:${accion}`, on])),
      'logistica:editar': pa.logisticaEdit,
      'solicitudes:editar': pa.solicitudesEdit,
      'solicitudes:catalogo:editar': pa.solicitudesCatalogoCrearEditar,
      'solicitudes:catalogo:eliminar': pa.solicitudesCatalogoEliminar,
    }
    return [
      syncPermisosProyecto(
        userId,
        proyectoId,
        Object.fromEntries(pa.modulos.map((m) => [m, { access: true }])),
        pa.financieroEdit,
        accionesExtra,
        pa.tabs,
        pa.subcontrato,
      ),
      pa.rolNegocio ? syncRolNegocio(userId, proyectoId, pa.rolNegocio) : Promise.resolve(),
    ]
  })
  const crmId = await getProyectoId('crm')
  await Promise.all([
    ...syncsProyectos,
    syncPermisosCrm(userId, input.crmModulos, input.crmAcciones),
    syncPermisosGestion(userId, input.gestionVer),
    input.crmRolNegocio ? syncRolNegocio(userId, crmId, input.crmRolNegocio) : Promise.resolve(),
  ])
  const { error } = await supabase.from('profiles').update({ rol: input.rol, grupo_id: input.grupoId, sucursal: input.sucursal }).eq('id', userId)
  if (error) throw new Error(error.message)
  await syncSubcontratistaLink(userId, input.subcontratistaId)
}

export function useAccesos() {
  const [accesos, setAccesos] = useState<Acceso[]>([])
  const [proyectosObra, setProyectosObra] = useState<ProyectoObra[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    const [{ data: obras, error: obrasError }, crmId, sistemaId] = await Promise.all([
      // Fase F: cualquier proyecto tipo obra, no solo La Chacra — mismo criterio que useAccesoUsuario.
      // Excluye 'sistema' (pseudo-proyecto ancla del módulo Gestión, §3.6) — ese acceso se gestiona
      // aparte (checkbox "Acceso a Gestión" en la pestaña Cuenta, no como proyecto con módulos).
      supabase.from('proyectos').select('id, nombre, slug').not('tipo', 'in', '(crm,sistema)').order('nombre'),
      getProyectoId('crm'),
      getProyectoId('sistema'),
    ])
    if (obrasError) {
      setError(obrasError.message)
      setLoading(false)
      return
    }
    const proyectosObraLista: ProyectoObra[] = obras ?? []
    const [
      { data: profiles, error: profilesError },
      { data: permisos, error: permisosError },
      { data: access, error: accessError },
      loginsResp,
      { data: subcontratistas, error: subcontratistasError },
    ] = await Promise.all([
      // is_root excluida: cuenta root oculta del listado, ver comentario en la columna.
      supabase.from('profiles').select('id, nombre, apellido, email, activo, is_super_admin, rol, grupo_id, sucursal').eq('is_root', false).order('nombre'),
      supabase.from('permisos').select('user_id, proyecto_id, modulo_key, accion'),
      supabase.from('project_access').select('user_id, proyecto_id, rol_negocio'),
      supabase.functions.invoke('manage-access', { body: { action: 'list_last_logins' } }),
      supabase.from('subcontratistas').select('id, user_id').not('user_id', 'is', null),
    ])
    const primerError = profilesError || permisosError || accessError || subcontratistasError
    if (primerError) {
      setError(primerError.message)
      setLoading(false)
      return
    }
    // Requiere is_super_admin (mismo gate que el resto de manage-access) — si quien
    // mira esta página no lo es, no rompemos el listado entero por esto.
    const logins: Record<string, string | null> = loginsResp.data?.logins ?? {}

    const mapped: Acceso[] = (profiles ?? []).map((p) => {
      const misPermisos = (permisos ?? []).filter((x) => x.user_id === p.id)
      const miAcceso = (access ?? []).filter((x) => x.user_id === p.id)

      const proyectos: Record<string, ProyectoAcceso> = {}
      for (const proy of proyectosObraLista) {
        // Pestañas: modulo_key con sufijo "modulo:tab" y accion 'ver' (ej. "dashboard:resumen") —
        // se listan aparte de `modulos` (que solo captura claves sin ':').
        const modulos = misPermisos
          .filter((x) => x.proyecto_id === proy.id && x.accion === 'ver' && !x.modulo_key.includes(':'))
          .map((x) => x.modulo_key)
        const tabs: Record<string, string[]> = {}
        const financieroEdit: Record<string, boolean> = {}
        const estadosPagoAcciones: Record<string, boolean> = {}
        const estadosPagoIngresosAcciones: Record<string, boolean> = {}
        let logisticaEdit = false
        let solicitudesEdit = false
        let solicitudesCatalogoCrearEditar = false
        let solicitudesCatalogoEliminar = false
        let subcontrato: 'WEDO' | 'CONBES' | '' = ''
        for (const x of misPermisos) {
          if (x.proyecto_id !== proy.id) continue
          if (x.modulo_key.startsWith('_subcontrato:')) {
            const valor = x.modulo_key.split(':')[1]
            if (valor === 'WEDO' || valor === 'CONBES') subcontrato = valor
          }
          if (x.accion === 'editar' && x.modulo_key.startsWith('financiero:')) {
            financieroEdit[x.modulo_key.split(':')[1]] = true
          }
          if (x.modulo_key === 'estados_pago' && x.accion !== 'ver') {
            estadosPagoAcciones[x.accion] = true
          }
          if (x.modulo_key === 'estados_pago_ingresos' && x.accion !== 'ver') {
            estadosPagoIngresosAcciones[x.accion] = true
          }
          if (x.modulo_key === 'logistica' && x.accion === 'editar') {
            logisticaEdit = true
          }
          if (x.modulo_key === 'solicitudes' && x.accion === 'editar') {
            solicitudesEdit = true
          }
          if (x.modulo_key === 'solicitudes:catalogo' && x.accion === 'editar') {
            solicitudesCatalogoCrearEditar = true
          }
          if (x.modulo_key === 'solicitudes:catalogo' && x.accion === 'eliminar') {
            solicitudesCatalogoEliminar = true
          }
          if (x.accion === 'ver' && x.modulo_key.includes(':')) {
            const [modulo, tab] = x.modulo_key.split(':')
            tabs[modulo] = [...(tabs[modulo] ?? []), tab]
          }
        }
        proyectos[proy.id] = {
          rolNegocio: miAcceso.find((x) => x.proyecto_id === proy.id)?.rol_negocio ?? '',
          modulos,
          tabs,
          financieroEdit,
          estadosPagoAcciones,
          estadosPagoIngresosAcciones,
          logisticaEdit,
          solicitudesEdit,
          solicitudesCatalogoCrearEditar,
          solicitudesCatalogoEliminar,
          subcontrato,
        }
      }

      const crmModulos = misPermisos.filter((x) => x.proyecto_id === crmId && x.accion === 'ver').map((x) => x.modulo_key)
      const crmAcciones: Record<string, boolean> = {}
      for (const x of misPermisos) {
        if (x.proyecto_id === crmId && x.accion !== 'ver') crmAcciones[`${x.modulo_key}:${x.accion}`] = true
      }
      const gestionVer = misPermisos.some((x) => x.proyecto_id === sistemaId && x.modulo_key === 'gestion' && x.accion === 'ver')
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
        crmAcciones,
        gestionVer,
        grupoId: p.grupo_id,
        sucursal: p.sucursal ?? null,
        subcontratistaId: (subcontratistas ?? []).find((s) => s.user_id === p.id)?.id ?? null,
        ultimoIngreso: logins[p.id] ?? null,
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
