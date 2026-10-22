import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { listarDocsEmpresas, listarEmpresas, listarEstadosPagoEmpresas, listarListados } from '../lib/api'
import { epPorValidar, periodoDe, situacionMes } from '../lib/contratistas'

/** Avisos del menú: empresas activas con la documentación del mes en curso atrasada y estados de pago
 *  por validar (solo si quien entra los valida). Se recalcula al cambiar de pantalla. */
export function useAlertaContratistas(validaEp: boolean): { atrasadas: number; epsPorValidar: number } {
  const { pathname } = useLocation()
  const [n, setN] = useState({ atrasadas: 0, epsPorValidar: 0 })

  useEffect(() => {
    let cancelado = false
    const periodo = periodoDe()
    Promise.all([listarEmpresas(), listarDocsEmpresas(periodo), listarListados(periodo), validaEp ? listarEstadosPagoEmpresas() : Promise.resolve([])])
      .then(([empresas, docs, listados, eps]) => {
        if (cancelado) return
        setN({
          atrasadas: empresas.filter((e) => e.activa && situacionMes(e.id, docs, listados, periodo).estado === 'atrasado').length,
          epsPorValidar: eps.filter((e) => epPorValidar(e.estado)).length,
        })
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [validaEp, pathname])

  return n
}
