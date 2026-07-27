import * as XLSX from 'xlsx'
import { N, parseDate } from './format'

export interface CurvaRow {
  fecha: unknown
  teorico: number | null
  diario: number | null
  activos: number | null
  m2PlanAcum: number | null
  m2PlanDiario: number | null
  iniciados: number | null
  terminados: number | null
  real: number | null
  mes: unknown
  anio: number | null
  m2RealAcum: number | null
  m2RealDiario: number | null
}

export interface ModuloRow {
  torre: unknown
  modulo: unknown
  serie: unknown
  tipo: unknown
  avance: number | null
  initTeorico: unknown
  initReal: unknown
  termPlan: unknown
  termReal: unknown
  estado: unknown
  gapInicio: number | null
  tiempoProy: number | null
  tiempoReal: number | null
}

export interface MembranaCieloRow {
  torre: unknown
  serie: unknown
  pisoEstado: unknown
  pisoFecha: unknown
  membranaEstado: unknown
  membranaFecha: unknown
}

export interface AvPlanRow {
  fecha: unknown
  initPlan: number | null
  planAcum: number | null
  initReal: number | null
  realAcum: number | null
  termPlan: number | null
  termPlanAcum: number | null
  termReal: number | null
  termRealAcum: number | null
}

export interface DetalleGdRow {
  fechaGuia: unknown
  anioGuia: number | null
  mes: number | null
  codigo: unknown
  desc: unknown
  um: unknown
  cant: number | null
  cantRec: number | null
  valorUN: number | null
  valorItem: number | null
  valorTotal: number | null
  valorPpto: number | null
  difUN: number | null
  difTotal: number | null
  difPct: number | null
  gd: unknown
  responsable: unknown
  montoGD: number | null
  oc: unknown
  presupuesto: number | null
  totalPpto: number | null
  tipoProd: unknown
}

export interface HomeAvanceRow {
  mes: unknown
  avEcon: number | null
  avEconProy: number | null
}

export interface ProductoRow {
  codigo: unknown
  desc: unknown
  descCorta: unknown
  critico: unknown
  cantMod: number | null
  cantComprada: number | null
  cantRec: number | null
  avTeorico: number | null
  precioCompra: number | null
  precioUN: number | null
  variacion: number | null
  pctAvPedidos: number | null
}

export interface DespachoRow {
  fecha: unknown
  gd: number | null
  serie: number | null
  cant: number | null
  monto: number | null
  modulo: unknown
  torre: unknown
  tipo: unknown
  acumulado: number | null
}

export interface ProyeccionRow {
  fecha: unknown
  mes: unknown
  modulosDia: number | null
  modulosAcumulados: number | null
}

export interface ParsedDashboardData {
  curva: CurvaRow[]
  // ponytail: solo se parsean las hojas que usa cada tab ya portado (resumen/modulos/compras/productos/stock/curva/despachos).
  // Sumar lo que falte cuando se porte proyeccion/prod-diaria.
  modulos: ModuloRow[]
  detalleGD: DetalleGdRow[]
  homeAvance: HomeAvanceRow[]
  productos: ProductoRow[]
  membranaCielo: MembranaCieloRow[]
  avplan: AvPlanRow[]
  despachos: DespachoRow[]
  proyeccion: ProyeccionRow[]
}

function sheetRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const ws = wb.Sheets[name]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, dateNF: 'yyyy-mm-dd' }) as unknown[][]
}

export function parseWorkbook(wb: XLSX.WorkBook): ParsedDashboardData {
  const curva: CurvaRow[] = sheetRows(wb, 'CURVA')
    .slice(1)
    .filter((r) => r[0])
    .map((r) => ({
      fecha: r[0], teorico: N(r[1]), diario: N(r[2]),
      activos: N(r[3]),
      m2PlanAcum: N(r[4]), m2PlanDiario: N(r[5]),
      iniciados: N(r[6]), terminados: N(r[7]),
      real: N(r[8]), mes: r[10], anio: N(r[11]),
      m2RealAcum: N(r[12]), m2RealDiario: N(r[13]),
    }))

  const modulos: ModuloRow[] = sheetRows(wb, 'AVANCE')
    .slice(1)
    .filter((r) => r[0])
    .map((r) => ({
      torre: r[0], modulo: r[1], serie: r[2], tipo: r[3],
      avance: N(r[4]), initTeorico: r[5], initReal: r[6],
      termPlan: r[8], termReal: r[10],
      estado: r[57], gapInicio: N(r[58]),
      tiempoProy: N(r[61]), tiempoReal: N(r[62]),
    }))

  const detalleGD: DetalleGdRow[] = sheetRows(wb, 'DETALLE GD')
    .slice(1)
    .filter((r) => r[0] && r[13] != null)
    .map((r) => {
      const fd = parseDate(r[0])
      return {
        fechaGuia: r[0], anioGuia: fd ? fd.getFullYear() : null,
        mes: N(r[3]), codigo: r[5], desc: r[6],
        um: r[7], cant: N(r[8]), cantRec: N(r[10]),
        valorUN: N(r[11]), valorItem: N(r[12]), valorTotal: N(r[13]),
        valorPpto: N(r[14]), difUN: N(r[15]), difTotal: N(r[16]), difPct: N(r[17]),
        gd: r[19], responsable: r[20], montoGD: N(r[21]), oc: r[22],
        presupuesto: N(r[23]), totalPpto: N(r[24]),
        tipoProd: r[28],
      }
    })

  const homeAvanceRows = sheetRows(wb, 'HOME AVANCE')
  const hi = homeAvanceRows.findIndex((r) => r.indexOf('MESES') >= 0)
  const homeAvance: HomeAvanceRow[] =
    hi < 0
      ? []
      : (() => {
          const bIdx = homeAvanceRows[hi].indexOf('MESES')
          return homeAvanceRows
            .slice(hi + 1, hi + 13)
            .filter((r) => r[bIdx])
            .map((r) => ({
              mes: r[bIdx],
              avEcon: r[bIdx + 5] != null ? +(r[bIdx + 5] as number) : null,
              avEconProy: r[bIdx + 7] != null ? +(r[bIdx + 7] as number) : null,
            }))
        })()

  const productos: ProductoRow[] = sheetRows(wb, 'PRODUCTOS')
    .slice(1)
    .filter((r) => r[0] && r[1])
    .map((r) => ({
      codigo: r[0], desc: r[1], descCorta: r[2], critico: r[10],
      cantMod: N(r[11]), cantComprada: N(r[16]), cantRec: N(r[18]),
      avTeorico: N(r[19]), precioCompra: N(r[20]), precioUN: N(r[21]),
      variacion: N(r[23]), pctAvPedidos: N(r[25]),
    }))

  const membranaCielo: MembranaCieloRow[] = sheetRows(wb, 'MEMBRANA_CIELO')
    .slice(1)
    .filter((r) => r[0])
    .map((r) => ({
      torre: r[0], serie: r[1], pisoEstado: r[2], pisoFecha: r[3],
      membranaEstado: r[4], membranaFecha: r[5],
    }))

  const avplan: AvPlanRow[] = sheetRows(wb, 'AV_PLAN')
    .slice(1)
    .filter((r) => r[0])
    .map((r) => ({
      fecha: r[0], initPlan: N(r[1]), planAcum: N(r[2]),
      initReal: N(r[3]), realAcum: N(r[4]),
      termPlan: N(r[5]), termPlanAcum: N(r[6]),
      termReal: N(r[7]), termRealAcum: N(r[8]),
    }))

  const despachos: DespachoRow[] = sheetRows(wb, 'GD_MODULOS')
    .slice(1)
    .filter((r) => r[1])
    .map((r) => ({
      fecha: r[1], gd: N(r[2]), serie: N(r[3]),
      cant: N(r[4]), monto: N(r[5]),
      modulo: r[6], torre: r[7], tipo: r[8], acumulado: N(r[9]),
    }))

  const proyeccion: ProyeccionRow[] = sheetRows(wb, 'GD_MODULOS')
    .slice(1)
    .filter((r) => r[12] != null && r[14] != null)
    .map((r) => ({
      fecha: r[12], mes: r[13],
      modulosDia: N(r[14]), modulosAcumulados: N(r[16]),
    }))

  return { curva, modulos, detalleGD, homeAvance, productos, membranaCielo, avplan, despachos, proyeccion }
}
