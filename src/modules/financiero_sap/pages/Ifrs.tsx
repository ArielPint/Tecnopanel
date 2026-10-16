import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'
import { BarraCorte, etiquetaCorte, useCorte } from '../components/Filtros'
import DetalleAsientos, { type PedidoDetalle } from '../components/DetalleAsientos'
import { Aviso, Cargando, PieFuente } from '../components/Estados'
import TablaEstado from '../components/TablaEstado'
import { useBalance, useCatalogos, useIfrs } from '../hooks/useDatosFin'
import { armarIfrs } from '../lib/balance'
import { RUTA } from '../lib/rutas'
import { abrirMovimientos, filasExcel } from './Balance'

// Estado de situación financiera clasificado (NIC 1): los saldos contables de SAP agrupados en los rubros
// IFRS (corrientes y no corrientes) según la clasificación de cuentas de la pantalla Clasificación IFRS.

export default function Ifrs() {
  const { catalogos, estado, error: errorCat } = useCatalogos()
  const { actual, cortes } = useCorte()
  const { datos, loading, error } = useBalance(cortes)
  const { rubros, mapeo, loading: cargandoIfrs, error: errorIfrs } = useIfrs()
  const [pedido, setPedido] = useState<PedidoDetalle | null>(null)

  const filas = useMemo(
    () => (catalogos && rubros.length > 0 && datos.length === cortes.length ? armarIfrs(datos, catalogos, mapeo, rubros) : null),
    [catalogos, datos, cortes.length, mapeo, rubros],
  )

  // cuentas con saldo en el corte cuya clasificación aún no revisa nadie (o no tienen)
  const pendientes = useMemo(() => {
    const conSaldo = new Set((datos[0]?.filas ?? []).filter((f) => f.cuenta && Math.round(f.saldo) !== 0).map((f) => f.cuenta as string))
    const m = new Map(mapeo.map((x) => [x.cuenta, x]))
    let sinRubro = 0
    let sinRevisar = 0
    for (const c of conSaldo) {
      const x = m.get(c)
      if (!x?.rubro) sinRubro++
      else if (!x.revisado) sinRevisar++
    }
    return { sinRubro, sinRevisar }
  }, [datos, mapeo])

  async function exportar() {
    if (!filas) return
    try {
      await exportarExcel(`situacion-financiera-ifrs-${actual}`, filasExcel(filas, cortes))
    } catch (e) {
      toast.error(`No se pudo exportar: ${(e as Error).message}`)
    }
  }

  const fallo = errorCat ?? error ?? errorIfrs
  if (fallo) return <Aviso error={fallo} />

  return (
    <div className="space-y-4">
      <BarraCorte estado={estado} />
      {(pendientes.sinRubro > 0 || pendientes.sinRevisar > 0) && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {pendientes.sinRubro > 0 && <>{pendientes.sinRubro} cuentas con saldo no tienen rubro IFRS (van en "Cuentas sin clasificar"). </>}
          {pendientes.sinRevisar > 0 && (
            <>{pendientes.sinRevisar} cuentas con saldo usan la clasificación propuesta automáticamente y aún no las revisa contabilidad. </>
          )}
          <Link to={RUTA.clasificacion} className="font-semibold underline">Revisar la clasificación</Link>
        </div>
      )}
      {!filas || loading || cargandoIfrs ? (
        <Cargando />
      ) : (
        <TablaEstado
          filas={filas}
          cortes={cortes.map((c) => ({ clave: c, etiqueta: `Al ${etiquetaCorte(c)}` }))}
          onDetalle={(f, c) => abrirMovimientos(f, c, setPedido)}
          acciones={
            <Button variant="outline" size="sm" onClick={exportar}>
              <Download className="mr-1 h-4 w-4" /> Exportar a Excel
            </Button>
          }
        />
      )}
      <PieFuente
        estado={estado}
        extra="Presentación del estado de situación financiera clasificado según NIC 1 (rubros de la taxonomía IFRS de la CMF), con los saldos contables de SAP agrupados según la clasificación de cuentas. No incluye ajustes de medición IFRS que no estén registrados en SAP. La ganancia del ejercicio aún no traspasada va en ganancias acumuladas."
      />
      {catalogos && <DetalleAsientos pedido={pedido} catalogos={catalogos} onClose={() => setPedido(null)} />}
    </div>
  )
}
