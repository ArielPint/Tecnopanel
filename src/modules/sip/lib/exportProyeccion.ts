import { cargarXLSX } from '@/lib/cargarLibrerias'
import type { FiltroSucursal } from './api'
import { fmtRango, proyeccionCierre, type Resumen } from './proyeccion'

const r0 = (n: number | null) => (n == null ? null : Math.round(n))
const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100)

/** Resumen de la proyección mensual: valor por línea y producido en unidades, como la hoja RESUMEN. */
export async function exportarResumenProyeccion(mes: string, sucursal: FiltroSucursal, r: Resumen, nombre: Map<string, string>) {
  const XLSX = await cargarXLSX()
  const sem = (s: Resumen['semanas'][number]) => `SEM ${s.numero} (${fmtRango(s)}, ${s.dias} d)`

  const filasValor = [...r.valor.filter((v) => v.proyectado || v.total || v.facturado), { ...r.total, linea_codigo: '' }].map((v) => {
    const cierre = proyeccionCierre(v.total, r)
    const fila: Record<string, string | number | null> = { 'Línea': v.linea_codigo ? (nombre.get(v.linea_codigo) ?? v.linea_codigo) : 'TOTAL', Proyectado: r0(v.proyectado) }
    for (const s of r.semanas) fila[sem(s)] = r0(v.porSemana.get(s.semana) ?? 0)
    fila.Producido = r0(v.total)
    fila['Por día'] = r.diasTranscurridos > 0 ? r0(v.total / r.diasTranscurridos) : null
    fila['Al cierre'] = r0(cierre)
    fila['Real / proy.'] = v.proyectado > 0 ? r2(v.total / v.proyectado) : null
    fila['Cierre / proy.'] = v.proyectado > 0 && cierre != null ? r2(cierre / v.proyectado) : null
    fila['Facturado SAP'] = r0(v.facturado)
    fila['Fact. / proy.'] = v.proyectado > 0 ? r2(v.facturado / v.proyectado) : null
    return fila
  })
  const filasUnidades = r.unidades.map((u) => {
    const fila: Record<string, string | number | null> = { 'Línea': nombre.get(u.linea_codigo) ?? u.linea_codigo, Unidad: u.unidad }
    for (const s of r.semanas) fila[sem(s)] = r2(u.porSemana.get(s.semana) ?? 0)
    fila.Total = r2(u.total)
    fila['Por día'] = r.diasTranscurridos > 0 ? r2(u.total / r.diasTranscurridos) : null
    fila['Al cierre'] = r2(proyeccionCierre(u.total, r))
    return fila
  })

  const libro = XLSX.utils.book_new()
  const hv = XLSX.utils.json_to_sheet(filasValor)
  hv['!cols'] = [{ wch: 24 }, ...Object.keys(filasValor[0] ?? {}).slice(1).map(() => ({ wch: 16 }))]
  XLSX.utils.book_append_sheet(libro, hv, 'Valor')
  const hu = XLSX.utils.json_to_sheet(filasUnidades.length ? filasUnidades : [{ 'Línea': 'Sin producción registrada' }])
  hu['!cols'] = [{ wch: 24 }, { wch: 8 }, ...r.semanas.map(() => ({ wch: 16 })), { wch: 12 }, { wch: 12 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(libro, hu, 'Unidades')
  const suc = sucursal === 'todas' ? 'todas' : sucursal.replace(' ', '-')
  XLSX.writeFile(libro, `proyeccion-${mes.slice(0, 7)}-${suc}.xlsx`)
}
