import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { misAccesos, SinPortalError, type MisAccesos } from '../lib/api'

const SIN_NADA: MisAccesos = { admin: false, configurar: false, eerr: [], balance: [], ventas: [] }

// Una consulta por sesión: todas las pantallas del portal comparten la misma respuesta.
let cache: { userId: string; promesa: Promise<MisAccesos> } | null = null

/** Lo que el usuario puede ver en el portal, para mostrar u ocultar menús. La base (fin_mis_accesos,
 *  políticas de fin_*) es la que manda de verdad; esto solo evita ofrecer lo que va a rechazar. */
export function usePermisosFin() {
  const userId = useAuthStore((s) => s.user?.id)
  const [accesos, setAccesos] = useState<MisAccesos>(SIN_NADA)
  const [loading, setLoading] = useState(true)
  const [sinPortal, setSinPortal] = useState(false)

  useEffect(() => {
    if (!userId) return
    if (cache?.userId !== userId) {
      const promesa = misAccesos()
      promesa.catch(() => (cache = null))
      cache = { userId, promesa }
    }
    let cancelado = false
    cache.promesa
      .then((a) => !cancelado && setAccesos(a))
      .catch((e) => !cancelado && setSinPortal(e instanceof SinPortalError))
      .finally(() => !cancelado && setLoading(false))
    return () => {
      cancelado = true
    }
  }, [userId])

  return {
    ...accesos,
    veEerr: accesos.eerr.length > 0,
    veVentas: accesos.ventas.length > 0,
    veBalance: accesos.balance.length > 0,
    sinPortal,
    loading,
  }
}
