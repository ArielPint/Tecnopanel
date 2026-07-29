import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { syncPermisosLaChacra } from '@/lib/syncPermisos'
import { defaultPagePerms, type PagePerms } from '../lib/pageMap'

export interface Usuario {
  id: string
  username: string
  name: string
  email: string
  role: string
  active: boolean
  permissions: Record<string, unknown>
  createdAt: string
  updatedAt: string
  lastLogin: string | null
}

export interface UsuarioInput {
  username: string
  password?: string
  name: string
  email: string
  role: string
  active: boolean
  pages: PagePerms
  financieroEdit: Record<string, boolean>
}

export interface LoginStats {
  count: number
  lastLogin: string
}

function mapRow(row: Record<string, unknown>): Usuario {
  return {
    id: row.id as string,
    username: row.username as string,
    name: row.name as string,
    email: (row.email as string) || '',
    role: row.role as string,
    active: row.active as boolean,
    permissions: (row.permissions as Record<string, unknown>) || {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    lastLogin: (row.last_login as string) || null,
  }
}

function buildPermissions(input: Pick<UsuarioInput, 'pages' | 'financieroEdit'>) {
  const permissions: Record<string, unknown> = { pages: input.pages }
  for (const [key, value] of Object.entries(input.financieroEdit)) {
    permissions[`permiso_financiero_${key}`] = value
  }
  return permissions
}

export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loginStats, setLoginStats] = useState<Record<string, LoginStats>>({})
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const [{ data: users }, { data: events }] = await Promise.all([
      supabase.from('user_profiles').select('*').order('created_at'),
      supabase.from('login_events').select('user_id,logged_at').order('logged_at', { ascending: false }),
    ])
    setUsuarios(((users ?? []) as Record<string, unknown>[]).map(mapRow))
    const stats: Record<string, LoginStats> = {}
    for (const ev of (events ?? []) as { user_id: string; logged_at: string }[]) {
      if (!stats[ev.user_id]) stats[ev.user_id] = { count: 0, lastLogin: ev.logged_at }
      stats[ev.user_id].count++
    }
    setLoginStats(stats)
    setLoading(false)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const crear = useCallback(
    async (input: UsuarioInput) => {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: {
          action: 'create',
          username: input.username.trim().toLowerCase(),
          password: input.password,
          name: input.name,
          email: input.email.trim().toLowerCase(),
          role: input.role,
          permissions: buildPermissions(input),
        },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      if (data?.id) await syncPermisosLaChacra(data.id, input.pages, input.financieroEdit)
      await refetch()
    },
    [refetch],
  )

  const actualizar = useCallback(
    async (id: string, input: UsuarioInput) => {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          username: input.username.trim().toLowerCase(),
          name: input.name,
          email: input.email.trim().toLowerCase(),
          role: input.role,
          active: input.active,
          permissions: buildPermissions(input),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw new Error(error.message)
      await syncPermisosLaChacra(id, input.pages, input.financieroEdit)
      if (input.password) {
        const { data, error: fnError } = await supabase.functions.invoke('manage-users', {
          body: { action: 'update_password', userId: id, password: input.password },
        })
        if (fnError) throw new Error(fnError.message)
        if (data?.error) throw new Error(data.error)
      }
      await refetch()
    },
    [refetch],
  )

  const eliminar = useCallback(
    async (id: string) => {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'delete', userId: id },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      await refetch()
    },
    [refetch],
  )

  return { usuarios, loginStats, loading, crear, actualizar, eliminar, defaultPagePerms }
}
