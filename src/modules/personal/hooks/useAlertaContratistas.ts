import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { listarDocsEmpresas, listarEmpresas } from '../lib/api'
import { estadoMes, faltantes, periodoDe } from '../lib/contratistas'

/** Empresas activas con la documentación del mes en curso atrasada, para el aviso del menú.
 *  Se recalcula al cambiar de pantalla (después de cargar documentos en Contratistas). */
export function useAlertaContratistas(activo: boolean): number {
  const { pathname } = useLocation()
  const [n, setN] = useState(0)

  useEffect(() => {
    if (!activo) return
    let cancelado = false
    const periodo = periodoDe()
    Promise.all([listarEmpresas(), listarDocsEmpresas(periodo)])
      .then(([empresas, docs]) => {
        if (cancelado) return
        setN(empresas.filter((e) => e.activa && estadoMes(faltantes(e.id, docs).length, periodo) === 'atrasado').length)
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [activo, pathname])

  return n
}
