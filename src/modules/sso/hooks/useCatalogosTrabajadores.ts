import { useCallback, useEffect, useState } from 'react'
import { listarEmpresas, listarTiposExamen } from '../lib/apiTrabajadores'
import type { Empresa, TipoExamen } from '../lib/tiposTrabajadores'

/** Empresas (propia + contratistas) y tipos de examen: los usan Trabajadores y Configuración. */
export function useCatalogosTrabajadores() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [tiposExamen, setTiposExamen] = useState<TipoExamen[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    try {
      const [e, t] = await Promise.all([listarEmpresas(), listarTiposExamen()])
      setEmpresas(e)
      setTiposExamen(t)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar catálogos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  return { empresas, tiposExamen, loading, error, recargar }
}
