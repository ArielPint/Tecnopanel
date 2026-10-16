import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/modules/financiero/components/ui/button'
import { exportarExcel } from '@/modules/financiero/utils/exportExcel'
import { BarraCorte, etiquetaCorte, useCorte } from '../components/Filtros'
import DetalleAsientos, { type PedidoDetalle } from '../components/DetalleAsientos'
import { Aviso, Cargando, PieFuente } from '../components/Estados'
import TablaEstado from '../components/TablaEstado'
import { useBalance, useCatalogos } from '../hooks/useDatosFin'
import { armarBalance, type FilaEstado } from '../lib/balance'
import { etiquetaMes } from '../lib/eerr'

// Balance general de toda la empresa (las dos sucursales), con la estructura del plan de cuentas de SAP.

export function abrirMovimientos(f: FilaEstado, corte: string, setPedido: (p: PedidoDetalle) => void) {
  setPedido({
    titulo: `${f.codigo ? `${f.codigo} · ` : ''}${f.nombre}`,
    subtitulo: `Movimientos de ${etiquetaMes(corte)} · saldo al ${etiquetaCorte(corte)}`,
    filtro: { desde: corte, hasta: corte, cuentas: f.cuentas, cecos: null, dim2: null, tabla: 'balance' },
    monto: f.valores[corte] ?? 0,
    prorrateado: 0,
    balance: { signo: f.signo },
  })
}

export function filasExcel(filas: FilaEstado[], cortes: string[]) {
  return filas.map((f) => ({
    Código: f.codigo ?? '',
    Cuenta: `${'   '.repeat(f.profundidad)}${f.nombre}`,
    ...Object.fromEntries(cortes.map((c) => [`Al ${etiquetaCorte(c)}`, Math.round(f.valores[c] ?? 0)])),
  }))
}

export default function Balance() {
  const { catalogos, estado, error: errorCat } = useCatalogos()
  const { actual, cortes } = useCorte()
  const { datos, loading, error } = useBalance(cortes)
  const [pedido, setPedido] = useState<PedidoDetalle | null>(null)

  const filas = useMemo(() => (catalogos && datos.length === cortes.length ? armarBalance(datos, catalogos) : null), [catalogos, datos, cortes.length])
  const enCurso = estado?.ultimo_periodo?.slice(0, 7) === actual

  async function exportar() {
    if (!filas) return
    try {
      await exportarExcel(`balance-general-${actual}`, filasExcel(filas, cortes))
    } catch (e) {
      toast.error(`No se pudo exportar: ${(e as Error).message}`)
    }
  }

  const fallo = errorCat ?? error
  if (fallo) return <Aviso error={fallo} />

  return (
    <div className="space-y-4">
      <BarraCorte estado={estado} />
      {enCurso && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {etiquetaMes(actual)} está en curso: los saldos son los registrados hasta hoy, no los del cierre del mes.
        </div>
      )}
      {!filas || loading ? (
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
        extra="Saldos de toda la empresa al cierre de cada mes, antes del asiento de cierre del ejercicio. Activos en positivo como debe − haber; pasivos y patrimonio como haber − debe. El resultado del ejercicio es la utilidad (o pérdida) del año aún no traspasada a utilidades acumuladas. Haz clic en una cifra para ver los movimientos del mes."
      />
      {catalogos && <DetalleAsientos pedido={pedido} catalogos={catalogos} onClose={() => setPedido(null)} />}
    </div>
  )
}
