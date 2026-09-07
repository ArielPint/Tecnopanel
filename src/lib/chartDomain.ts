// ponytail: dominios de eje con aire en el extremo. Sin esto el dominio termina
// exactamente en el maximo del dataset y las etiquetas position="top" (y los
// puntos de las lineas) quedan cortadas contra el borde del grafico.

const pad = (v: number) => Math.max(3, Math.ceil(Math.abs(v) * 0.1))

/** Datos siempre positivos: parte en 0 y deja aire arriba. */
export const yHeadroom: [number, (dataMax: number) => number] = [0, (dataMax) => dataMax + pad(dataMax)]

/** Datos que pueden ser negativos: deja aire en el extremo que corresponda. */
export const yHeadroomSigned: [(dataMin: number) => number, (dataMax: number) => number] = [
  (dataMin) => (dataMin < 0 ? dataMin - pad(dataMin) : 0),
  (dataMax) => dataMax + pad(dataMax),
]

export function demo() {
  const [min, max] = yHeadroom
  const [sMin, sMax] = yHeadroomSigned
  console.assert(min === 0, 'yHeadroom parte en 0')
  console.assert(max(4) === 7, `4 -> 7, dio ${max(4)}`)
  console.assert(max(100) === 110, `100 -> 110, dio ${max(100)}`)
  console.assert(max(0) === 3, `0 -> 3, dio ${max(0)}`)
  console.assert(sMin(0) === 0 && sMin(5) === 0, 'sin negativos, el piso queda en 0')
  console.assert(sMin(-40) === -44, `-40 -> -44, dio ${sMin(-40)}`)
  console.assert(sMin(-1) === -4, `-1 -> -4, dio ${sMin(-1)}`)
  console.assert(sMax(12) === 15, `12 -> 15, dio ${sMax(12)}`)
}
