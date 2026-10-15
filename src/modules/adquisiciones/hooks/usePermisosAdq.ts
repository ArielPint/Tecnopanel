import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { ADQ_ANCLA_ID } from '@/lib/proyectoIds'
import { SUCURSALES } from '@/lib/lineasNegocio'
import { useAuthStore } from '@/store/authStore'
import { useAccesoUsuario } from '@/hooks/useAccesoUsuario'
import type { RolAdq } from '../lib/catalogos'

/** Roles del usuario en el portal, por sucursal, para mostrar u ocultar menús y botones. La RLS y las
 *  funciones adq_* son las que mandan de verdad; esto solo evita ofrecer lo que la base va a rechazar.
 *  En la base cada rol es una fila 'adq:<rol>:<sucursal>' sobre ADQ_ANCLA_ID. */
export function usePermisosAdq() {
  const userId = useAuthStore((s) => s.user?.id)
  const { isAdmin, isSuperAdmin, loading: accesoLoading } = useAccesoUsuario()
  // 'comprador:Santiago', 'aprobador_2:Puerto Varas', ...
  const [roles, setRoles] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelado = false
    supabase
      .from('permisos')
      .select('modulo_key')
      .eq('user_id', userId)
      .eq('proyecto_id', ADQ_ANCLA_ID)
      .like('modulo_key', 'adq:%')
      .then(({ data }) => {
        if (cancelado) return
        setRoles(new Set((data ?? []).map((p) => p.modulo_key.slice(4))))
        setLoading(false)
      })
    return () => {
      cancelado = true
    }
  }, [userId])

  // Mismo criterio que adq_usuario_tiene_en(): los admin del hub tienen todos los roles en ambas sucursales.
  // Sin sucursal: en alguna.
  const esAdmin = isAdmin || isSuperAdmin
  const tieneEn = useCallback(
    (rol: RolAdq, sucursal?: string | null) =>
      esAdmin || (sucursal ? roles.has(`${rol}:${sucursal}`) : [...roles].some((r) => r.startsWith(`${rol}:`))),
    [esAdmin, roles],
  )
  const tiene = useCallback((rol: RolAdq) => tieneEn(rol), [tieneEn])
  const nivelEn = useCallback(
    (sucursal?: string | null) => (tieneEn('aprobador_3', sucursal) ? 3 : tieneEn('aprobador_2', sucursal) ? 2 : tieneEn('aprobador_1', sucursal) ? 1 : 0),
    [tieneEn],
  )
  const comprasEn = useCallback((sucursal?: string | null) => tieneEn('comprador', sucursal) || tieneEn('jefe_compras', sucursal), [tieneEn])
  const solicitaEn = useCallback(
    (sucursal?: string | null) => tieneEn('solicitante', sucursal) || tieneEn('bodega', sucursal) || comprasEn(sucursal),
    [tieneEn, comprasEn],
  )
  // Mismo criterio que adq_ve_control_en() y adq_ve_reposicion_en()
  const controlEn = useCallback((sucursal?: string | null) => comprasEn(sucursal) || nivelEn(sucursal) > 0, [comprasEn, nivelEn])
  const reposicionEn = useCallback((sucursal?: string | null) => comprasEn(sucursal) || tieneEn('bodega', sucursal), [comprasEn, tieneEn])

  const sucursales = useMemo(() => {
    const donde = (f: (s: string) => boolean) => SUCURSALES.filter((s) => f(s)) as string[]
    return {
      solicitar: donde(solicitaEn),
      compras: donde(comprasEn),
      control: donde(controlEn),
      reposicion: donde(reposicionEn),
      jefe: donde((s) => tieneEn('jefe_compras', s)),
    }
  }, [solicitaEn, comprasEn, controlEn, reposicionEn, tieneEn])

  return {
    userId: userId ?? '',
    tiene,
    tieneEn,
    nivelEn,
    comprasEn,
    controlEn,
    solicitaEn,
    /** En alguna sucursal */
    esCompras: comprasEn(),
    puedeSolicitar: solicitaEn(),
    nivel: nivelEn(),
    veControl: controlEn(),
    veReposicion: reposicionEn(),
    sucursales,
    esAdmin,
    loading: loading || accesoLoading,
  }
}
