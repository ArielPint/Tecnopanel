import { useCallback, useEffect, useMemo, useState } from 'react'
import { listarAreas, listarUsuariosSso } from '../lib/api'
import type { Area, UsuarioSso } from '../lib/tipos'

/** Áreas y personas del módulo: se usan en casi todas las pantallas (filtros, formularios, nombres). */
export function useDatosSso() {
  const [areas, setAreas] = useState<Area[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioSso[]>([])
  const [responsables, setResponsables] = useState<UsuarioSso[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const recargar = useCallback(async () => {
    try {
      const [a, u, r] = await Promise.all([listarAreas(), listarUsuariosSso('ver'), listarUsuariosSso('editar')])
      setAreas(a)
      setUsuarios(u)
      setResponsables(r)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos del módulo')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const nombreUsuario = useMemo(() => {
    const mapa = new Map(usuarios.map((u) => [u.id, u.nombre || u.email]))
    // Quien ya no tiene acceso al módulo no sale en sso_usuarios(): se muestra sin nombre.
    return (id: string | null | undefined) => (id ? mapa.get(id) ?? 'Usuario sin acceso' : '—')
  }, [usuarios])

  const nombreArea = useMemo(() => {
    const mapa = new Map(areas.map((a) => [a.id, a.nombre]))
    return (id: string | null | undefined) => (id ? mapa.get(id) ?? '—' : 'Sin área')
  }, [areas])

  return { areas, usuarios, responsables, nombreUsuario, nombreArea, error, loading, recargar }
}
