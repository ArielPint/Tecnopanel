export interface RegistroCalcRow {
  cantidad_sol: number | null
  devolucion: number | null
  valor_und: number | null
  valor_total_item: number | null
}

export function calcCR(r: RegistroCalcRow) {
  return (r.cantidad_sol || 0) - (r.devolucion || 0)
}

export function getVTI(r: RegistroCalcRow) {
  if (r.valor_total_item != null) return r.valor_total_item
  return (r.valor_und || 0) * calcCR(r)
}

export function calcVUnd(r: RegistroCalcRow) {
  const cr = calcCR(r)
  return cr ? getVTI(r) / cr : 0
}

export function calcDifUnd(r: RegistroCalcRow, ppto: number) {
  return calcVUnd(r) - ppto
}

export function calcDifT(r: RegistroCalcRow, ppto: number) {
  return getVTI(r) - calcCR(r) * ppto
}

export function calcPct(r: RegistroCalcRow, ppto: number) {
  const base = calcCR(r) * ppto
  return base ? (calcDifT(r, ppto) / base) * 100 : null
}

export const normCod = (c: string) => String(c || '').trim().toUpperCase()
