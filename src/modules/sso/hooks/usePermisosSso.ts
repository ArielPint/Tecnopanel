import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { SSO_ANCLA_ID } from '@/lib/proyectoIds'
import { useAuthStore } from '@/store/authStore'
import { useAccesoUsuario } from '@/hooks/useAccesoUsuario'
import type { ModuloSso } from '../lib/accesos'
import type { AccionSso } from '../lib/tipos'

/** Acciones del usuario en el portal, para mostrar u ocultar menús y botones. La RLS y los
 *  triggers son los que mandan de verdad; esto solo evita ofrecer lo que la base va a rechazar.
 *  Con `modulo`, `puede(accion)` pregunta por ese módulo (así lo usan las pantallas de cada uno). */
export function usePermisosSso(modulo?: ModuloSso) {
  const userId = useAuthStore((s) => s.user?.id)
  const { isAdmin, isSuperAdmin, loading: accesoLoading } = useAccesoUsuario()
  const [claves, setClaves] = useState<Set<string>>(new Set())
  const [areas, setAreas] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelado = false
    Promise.all([
      supabase.from('permisos').select('modulo_key, accion').eq('user_id', userId).eq('proyecto_id', SSO_ANCLA_ID).like('modulo_key', 'sso:%'),
      // áreas a las que está restringido (Usuarios > Prevención); sin filas, ve todas
      supabase.from('sso_area_usuarios').select('area:sso_areas(nombre)').eq('user_id', userId),
    ]).then(([{ data }, { data: au }]) => {
      if (cancelado) return
      setClaves(new Set((data ?? []).map((p) => `${p.modulo_key.slice(4)}:${p.accion}`)))
      const nombres = ((au ?? []) as unknown as { area: { nombre: string } | null }[]).map((x) => x.area?.nombre ?? '').filter(Boolean)
      setAreas(nombres.sort())
      setLoading(false)
    })
    return () => {
      cancelado = true
    }
  }, [userId])

  // Mismo criterio que sso_usuario_puede_modulo(): los admin del portal pueden todo.
  const esAdmin = isAdmin || isSuperAdmin
  const puedeEn = useCallback(
    (m: ModuloSso, accion: AccionSso = 'ver') => esAdmin || claves.has(`${m}:${accion}`),
    [esAdmin, claves],
  )
  const puede = useCallback((accion: AccionSso) => (modulo ? puedeEn(modulo, accion) : false), [modulo, puedeEn])

  // Mismo criterio que sso_restringido_area(): con áreas asignadas y sin ser admin
  const restringido = !esAdmin && areas.length > 0

  return { userId: userId ?? '', puede, puedeEn, esAdmin, restringido, misAreas: areas, loading: loading || accesoLoading }
}
