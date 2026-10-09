import type { WorkSheet } from 'xlsx'
import { cargarXLSX, type XLSXLib } from '@/lib/cargarLibrerias'
import type { ConsumoV, LineaV, ParteV } from './api'
import type { MaterialConsumido } from './calculo'
import { fmtFecha, fmtHora, serialExcel } from './formato'

// Fechas como número de serie con formato (con Date, SheetJS las corre un día por la zona horaria).
function conFechas(XLSX: XLSXLib, hoja: WorkSheet, columna: number, filas: number) {
  for (let r = 1; r <= filas; r++) {
    const c = hoja[XLSX.utils.encode_cell({ r, c: columna })]
    if (c && typeof c.v === 'number') c.z = 'dd-mm-yyyy'
  }
}

function hoja<T extends object>(XLSX: XLSXLib, filas: T[], anchos: number[], columnaFecha?: number) {
  const h = XLSX.utils.json_to_sheet(filas)
  if (columnaFecha !== undefined) conFechas(XLSX, h, columnaFecha, filas.length)
  h['!cols'] = anchos.map((wch) => ({ wch }))
  return h
}

const tramo = (desde: string | null, hasta: string | null) => (desde && hasta ? `${fmtHora(desde)}-${fmtHora(hasta)}` : 'Día completo')

/** Registro de producción: una fila por panel de cada registro. */
export async function exportarRegistroExcel(lineas: LineaV[], partes: ParteV[], desde: string, hasta: string) {
  const XLSX = await cargarXLSX()
  const porParte = new Map(partes.map((p) => [p.id, p]))
  const filas = lineas.map((l) => {
    const p = porParte.get(l.parte_id)
    return {
      Fecha: serialExcel(l.fecha),
      Horario: tramo(l.hora_desde, l.hora_hasta),
      'N° registro': l.parte_numero,
      'Código panel': l.panel_codigo,
      Panel: l.panel_descripcion,
      Buenos: l.buenos,
      Rechazados: l.rechazados,
      Total: l.total,
      'm² buenos': Math.round(l.buenos * l.m2_panel * 100) / 100,
      Proyecto: l.proyecto_nombre ?? '',
      'OT / pedido': l.referencia ?? '',
      'Registrado por': p?.registrado_por ?? '',
      Observación: p?.observacion ?? '',
    }
  })
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja(XLSX, filas, [12, 13, 11, 13, 46, 9, 11, 9, 11, 22, 16, 24, 30], 0), 'Producción')
  XLSX.writeFile(libro, `produccion-sip_${fmtFecha(desde)}_a_${fmtFecha(hasta)}.xlsx`)
}

/** Consumo de materiales: resumen por material, por día y el detalle por panel. */
export async function exportarConsumoExcel(resumen: MaterialConsumido[], consumos: ConsumoV[], desde: string, hasta: string) {
  const XLSX = await cargarXLSX()
  const r = resumen.map((m) => ({
    Código: m.codigo,
    Material: m.descripcion,
    Unidad: m.unidad,
    'Paneles buenos': m.buenos,
    'Merma (rechazados)': m.merma,
    Total: m.total,
  }))

  const dia = new Map<string, { Fecha: number; Código: string; Material: string; Unidad: string; Total: number }>()
  for (const c of consumos) {
    const k = `${c.fecha}|${c.material_codigo}`
    const f = dia.get(k) ?? { Fecha: serialExcel(c.fecha), Código: c.material_codigo, Material: c.material_descripcion, Unidad: c.unidad, Total: 0 }
    f.Total = Math.round((f.Total + c.cantidad_total) * 1e6) / 1e6
    dia.set(k, f)
  }
  const porDia = [...dia.values()].sort((a, b) => a.Fecha - b.Fecha || a.Código.localeCompare(b.Código))

  const detalle = consumos.map((c) => ({
    Fecha: serialExcel(c.fecha),
    'Código panel': c.panel_codigo,
    'OT / pedido': c.referencia ?? '',
    Código: c.material_codigo,
    Material: c.material_descripcion,
    Unidad: c.unidad,
    'Por panel': c.cantidad_unitaria,
    'Paneles buenos': c.cantidad_buenos,
    Merma: c.cantidad_merma,
    Total: c.cantidad_total,
  }))

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja(XLSX, r, [12, 46, 10, 15, 18, 12]), 'Resumen')
  XLSX.utils.book_append_sheet(libro, hoja(XLSX, porDia, [12, 12, 46, 10, 12], 0), 'Por día')
  XLSX.utils.book_append_sheet(libro, hoja(XLSX, detalle, [12, 13, 16, 12, 46, 10, 11, 15, 11, 12], 0), 'Detalle')
  XLSX.writeFile(libro, `consumo-materiales-sip_${fmtFecha(desde)}_a_${fmtFecha(hasta)}.xlsx`)
}

/** Resultado de la calculadora. */
export async function exportarCalculoExcel(pedido: { codigo: string; descripcion: string; cantidad: number }[], materiales: MaterialConsumido[]) {
  const XLSX = await cargarXLSX()
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    libro,
    hoja(XLSX, pedido.map((p) => ({ 'Código panel': p.codigo, Panel: p.descripcion, Cantidad: p.cantidad })), [13, 50, 10]),
    'Paneles',
  )
  XLSX.utils.book_append_sheet(
    libro,
    hoja(XLSX, materiales.map((m) => ({ Código: m.codigo, Material: m.descripcion, Unidad: m.unidad, Cantidad: m.total })), [12, 46, 10, 14]),
    'Materiales',
  )
  XLSX.writeFile(libro, 'calculo-materiales-sip.xlsx')
}
