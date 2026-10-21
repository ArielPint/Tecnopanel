import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { listarDocsEmpresas, listarEmpresas, listarListados } from '../lib/api'
import { periodoDe, situacionMes } from '../lib/contratistas'

/** Empresas activas con la documentación del mes en curso atrasada, para el aviso del menú.
 *  (Lo que está por revisar lo muestra la pantalla Contratistas.)
 *  Se recalcula al cambiar de pantalla (después de cargar documentos en Contratistas). */
export function useAlertaContratistas(activo: boolean): number {
  const { pathname } = useLocation()
  const [n, setN] = useState(0)

  useEffect(() => {
    if (!activo) return
    let cancelado = false
    const periodo = periodoDe()
    Promise.all([listarEmpresas(), listarDocsEmpresas(periodo), listarListados(periodo)])
      .then(([empresas, docs, listados]) => {
        if (cancelado) return
        setN(empresas.filter((e) => e.activa && situacionMes(e.id, docs, listados, periodo).estado === 'atrasado').length)
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [activo, pathname])

  return n
}
