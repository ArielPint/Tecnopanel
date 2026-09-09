// Cálculo de costo por módulo / torre / proyecto y proyección de compras hasta el
// cierre de las 22 torres. Todo puro: la pestaña Proyección solo pinta lo que sale
// de acá, y demo() al final del archivo lo verifica sin levantar la app.
//
// Dos miradas del costo por módulo, deliberadamente separadas:
//  - TEÓRICO: receta (cantidad_por_modulo del catálogo) × precio. Es lo que un
//    módulo debería costar.
//  - REAL: plata efectivamente comprada ÷ módulos terminados. Es lo que está
//    costando, e incluye mermas, pérdidas y compras fuera de receta.
// La brecha entre ambos es el dato que se pidió mirar; no se promedian ni se
// elige uno, porque cada uno responde una pregunta distinta.
//
// Lo que NO se puede hacer: atribuir gasto a un módulo puntual.
// registro_compras.obs_modulo es texto libre ("STOCK", vacío, "Modulos 194- 195"),
// así que no existe trazabilidad módulo↔gasto y el costo por módulo es siempre
// una valorización o un promedio, nunca un rastreo.

export type BasePrecio = 'ppp' | 'ppto' | 'ultimo'

export const BASE_PRECIO_LABEL: Record<BasePrecio, string> = {
  ppp: 'PPP real',
  ppto: 'Presupuesto',
  ultimo: 'Último valor comprado',
}

export interface ProductoReceta {
  codigo: string
  descripcion: string
  unidad: string
  grupo: string
  /** cantidad_por_modulo del catálogo. Solo entran los > 0. */
  cantidadPorModulo: number
  ppp: number | null
  ppto: number | null
  ultimo: number | null
}

export function precioDe(p: ProductoReceta, base: BasePrecio): number | null {
  const v = base === 'ppp' ? p.ppp : base === 'ppto' ? p.ppto : p.ultimo
  return v != null && v > 0 ? v : null
}

export interface LineaCosto {
  codigo: string
  descripcion: string
  unidad: string
  grupo: string
  cantidad: number
  precio: number | null
  costo: number
  /** % del costo del módulo que explica esta línea. */
  incidencia: number
}

export interface CostoModulo {
  lineas: LineaCosto[]
  total: number
  /** Productos de la receta que quedaron sin precio en la base elegida: su costo va en 0. */
  sinPrecio: number
  productos: number
}

/** Costo teórico de un módulo: suma de receta × precio, línea a línea. */
export function costoPorModulo(productos: ProductoReceta[], base: BasePrecio): CostoModulo {
  const conReceta = productos.filter((p) => p.cantidadPorModulo > 0)
  const lineas: LineaCosto[] = conReceta.map((p) => {
    const precio = precioDe(p, base)
    return {
      codigo: p.codigo,
      descripcion: p.descripcion,
      unidad: p.unidad,
      grupo: p.grupo,
      cantidad: p.cantidadPorModulo,
      precio,
      costo: precio == null ? 0 : p.cantidadPorModulo * precio,
      incidencia: 0,
    }
  })
  const total = lineas.reduce((s, l) => s + l.costo, 0)
  for (const l of lineas) l.incidencia = total ? l.costo / total : 0
  lineas.sort((a, b) => b.costo - a.costo)
  return {
    lineas,
    total,
    sinPrecio: lineas.filter((l) => l.precio == null).length,
    productos: lineas.length,
  }
}

export interface ModuloEstado {
  torre: string
  terminado: boolean
}

export interface TorreCosto {
  torre: string
  modulos: number
  terminados: number
  pendientes: number
  avance: number
  costoTotal: number
  costoTerminado: number
  costoPendiente: number
}

/** Monto por torre = módulos de la torre × costo del módulo, partido en hecho / por hacer. */
export function costoPorTorre(modulos: ModuloEstado[], costoModulo: number): TorreCosto[] {
  const acc = new Map<string, { modulos: number; terminados: number }>()
  for (const m of modulos) {
    const t = m.torre || 'SIN TORRE'
    const prev = acc.get(t) ?? { modulos: 0, terminados: 0 }
    prev.modulos++
    if (m.terminado) prev.terminados++
    acc.set(t, prev)
  }
  return [...acc.entries()]
    .map(([torre, v]) => ({
      torre,
      modulos: v.modulos,
      terminados: v.terminados,
      pendientes: v.modulos - v.terminados,
      avance: v.modulos ? v.terminados / v.modulos : 0,
      costoTotal: v.modulos * costoModulo,
      costoTerminado: v.terminados * costoModulo,
      costoPendiente: (v.modulos - v.terminados) * costoModulo,
    }))
    .sort((a, b) => a.torre.localeCompare(b.torre, 'es'))
}

export interface CostoReal {
  /** Total comprado del proyecto, sin tocar. */
  comprado: number
  /** Stock físico en bodega valorizado — parte del comprado que aún no se consume. */
  stockValorizado: number
  compradoNeto: number
  terminados: number
  /** comprado ÷ terminados. Sobreestima: arrastra el stock no consumido. */
  porModuloCrudo: number | null
  /** (comprado − stock) ÷ terminados. */
  porModuloAjustado: number | null
}

export function costoReal(comprado: number, stockValorizado: number, terminados: number): CostoReal {
  const compradoNeto = comprado - stockValorizado
  return {
    comprado,
    stockValorizado,
    compradoNeto,
    terminados,
    porModuloCrudo: terminados > 0 ? comprado / terminados : null,
    porModuloAjustado: terminados > 0 ? compradoNeto / terminados : null,
  }
}

export interface StockItem {
  codigo: string
  cantidad: number
}

/** Valoriza el stock físico con la misma base de precio que el resto del reporte. */
export function valorizarStock(stock: StockItem[], productos: ProductoReceta[], base: BasePrecio): number {
  const precios = new Map<string, number>()
  for (const p of productos) {
    const v = precioDe(p, base)
    if (v != null) precios.set(p.codigo, v)
  }
  let total = 0
  for (const s of stock) {
    const precio = precios.get(s.codigo)
    if (precio != null && s.cantidad > 0) total += s.cantidad * precio
  }
  return total
}

export interface PuntoCurva {
  mes: string
  /** Compras reales del mes. null en los meses proyectados. */
  real: number | null
  /** Compras proyectadas del mes. null en los meses ya ejecutados. */
  proyectado: number | null
  acumulado: number
}

export interface Proyeccion {
  modulosTotales: number
  terminados: number
  restantes: number
  /** Módulos por mes usados para proyectar. */
  ritmo: number
  mesesRestantes: number
  fechaTermino: Date | null
  /** Gasto que falta = restantes × costo por módulo. */
  faltante: number
  /** comprado + faltante. */
  totalProyectado: number
  curva: PuntoCurva[]
}

const MESES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function mesLabel(d: Date): string {
  return `${MESES_ABREV[d.getMonth()]} ${d.getFullYear()}`
}

export interface SerieMensualReal {
  /** Primer día del mes. */
  fecha: Date
  monto: number
}

export interface ProyeccionInput {
  modulosTotales: number
  terminados: number
  /** Módulos por mes. Editable en pantalla; si es <= 0 no se proyecta nada. */
  ritmo: number
  /** Costo por módulo con el que se valoriza lo que falta. */
  costoModulo: number
  comprado: number
  serieReal: SerieMensualReal[]
  /** Hoy — parámetro para que demo() sea determinista. */
  hoy?: Date
}

/**
 * Reparte el gasto que falta en meses futuros al ritmo dado. Sin reajuste de
 * precios: la proyección va en pesos de hoy, y el escenario alcista se obtiene
 * cambiando la base de precio a "último valor comprado".
 */
export function proyectar(input: ProyeccionInput): Proyeccion {
  const { modulosTotales, terminados, ritmo, costoModulo, comprado, serieReal } = input
  const hoy = input.hoy ?? new Date()
  const restantes = Math.max(0, modulosTotales - terminados)
  const faltante = restantes * costoModulo

  const curva: PuntoCurva[] = []
  let acumulado = 0
  const ordenada = [...serieReal].sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
  for (const p of ordenada) {
    acumulado += p.monto
    curva.push({ mes: mesLabel(p.fecha), real: Math.round(p.monto), proyectado: null, acumulado: Math.round(acumulado) })
  }

  if (ritmo <= 0 || restantes === 0) {
    return {
      modulosTotales, terminados, restantes, ritmo,
      mesesRestantes: 0, fechaTermino: null, faltante, totalProyectado: comprado + faltante, curva,
    }
  }

  const mesesRestantes = restantes / ritmo
  const gastoMensual = ritmo * costoModulo
  // El mes en curso ya tiene compras reales cargadas, así que la proyección arranca
  // el mes siguiente para no pisar ese dato con una estimación.
  const cursor = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)
  const mesesEnteros = Math.floor(mesesRestantes)
  const resto = mesesRestantes - mesesEnteros

  for (let i = 0; i < mesesEnteros; i++) {
    acumulado += gastoMensual
    curva.push({
      mes: mesLabel(new Date(cursor.getFullYear(), cursor.getMonth() + i, 1)),
      real: null,
      proyectado: Math.round(gastoMensual),
      acumulado: Math.round(acumulado),
    })
  }
  if (resto > 0.001) {
    const parcial = gastoMensual * resto
    acumulado += parcial
    curva.push({
      mes: mesLabel(new Date(cursor.getFullYear(), cursor.getMonth() + mesesEnteros, 1)),
      real: null,
      proyectado: Math.round(parcial),
      acumulado: Math.round(acumulado),
    })
  }

  // El último mes de la curva es el que cierra el proyecto: si el ritmo no calza
  // justo, es el mes parcial y el día va proporcional al resto; si calza, es el
  // último mes entero y cierra a fin de mes.
  const hayParcial = resto > 0.001
  const finMes = new Date(cursor.getFullYear(), cursor.getMonth() + mesesEnteros - (hayParcial ? 0 : 1), 1)
  const diasMes = new Date(finMes.getFullYear(), finMes.getMonth() + 1, 0).getDate()
  const dia = hayParcial ? Math.max(1, Math.round(resto * diasMes)) : diasMes
  const fechaTermino = new Date(finMes.getFullYear(), finMes.getMonth(), dia)

  return {
    modulosTotales, terminados, restantes, ritmo,
    mesesRestantes, fechaTermino, faltante, totalProyectado: comprado + faltante, curva,
  }
}

/**
 * Ritmo observado en módulos/mes, sobre los últimos `meses` cerrados de la serie.
 * Ignora el mes en curso: va incompleto y hunde el promedio.
 */
export function ritmoObservado(serie: { fecha: Date; modulos: number }[], meses = 3, hoy = new Date()): number | null {
  const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime()
  const cerrados = serie
    .filter((p) => p.fecha.getTime() < inicioMesActual)
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
    .slice(0, meses)
  if (!cerrados.length) return null
  return cerrados.reduce((s, p) => s + p.modulos, 0) / cerrados.length
}

// ponytail: un solo self-check ejecutable en vez de una suite — corre con
// `npx tsx src/modules/planta/lib/proyeccionCostos.ts`.
export function demo() {
  const productos: ProductoReceta[] = [
    { codigo: 'A', descripcion: 'Pino', unidad: 'PZA', grupo: '', cantidadPorModulo: 10, ppp: 1000, ppto: 900, ultimo: 1100 },
    { codigo: 'B', descripcion: 'Tornillo', unidad: 'UND', grupo: '', cantidadPorModulo: 100, ppp: 5, ppto: 4, ultimo: 6 },
    { codigo: 'C', descripcion: 'Sin precio', unidad: 'UND', grupo: '', cantidadPorModulo: 2, ppp: null, ppto: null, ultimo: null },
    { codigo: 'D', descripcion: 'Sin receta', unidad: 'UND', grupo: '', cantidadPorModulo: 0, ppp: 999, ppto: 999, ultimo: 999 },
  ]

  const cm = costoPorModulo(productos, 'ppp')
  console.assert(cm.total === 10500, `costo ppp esperado 10500, dio ${cm.total}`)
  console.assert(cm.productos === 3, `solo los 3 con receta, dio ${cm.productos}`)
  console.assert(cm.sinPrecio === 1, `1 sin precio, dio ${cm.sinPrecio}`)
  console.assert(cm.lineas[0].codigo === 'A', 'ordenado por costo descendente')
  console.assert(Math.abs(cm.lineas[0].incidencia - 10000 / 10500) < 1e-9, 'incidencia mal calculada')
  console.assert(costoPorModulo(productos, 'ppto').total === 9400, 'costo ppto esperado 9400')
  console.assert(costoPorModulo(productos, 'ultimo').total === 11600, 'costo ultimo esperado 11600')

  const modulos: ModuloEstado[] = [
    { torre: 'TORRE 01', terminado: true }, { torre: 'TORRE 01', terminado: true },
    { torre: 'TORRE 02', terminado: true }, { torre: 'TORRE 02', terminado: false },
  ]
  const torres = costoPorTorre(modulos, 100)
  console.assert(torres.length === 2, 'dos torres')
  console.assert(torres[0].costoTotal === 200 && torres[0].costoPendiente === 0, 'torre 01 completa')
  console.assert(torres[1].avance === 0.5 && torres[1].costoPendiente === 100, 'torre 02 a medias')

  const stockVal = valorizarStock([{ codigo: 'A', cantidad: 5 }, { codigo: 'C', cantidad: 9 }], productos, 'ppp')
  console.assert(stockVal === 5000, `stock valorizado 5000 (C no tiene precio), dio ${stockVal}`)

  const real = costoReal(1000, 200, 4)
  console.assert(real.porModuloCrudo === 250 && real.porModuloAjustado === 200, 'costo real crudo/ajustado')
  console.assert(costoReal(1000, 0, 0).porModuloCrudo === null, 'sin terminados no hay costo real')

  const serie: SerieMensualReal[] = [
    { fecha: new Date(2026, 6, 1), monto: 100 },
    { fecha: new Date(2026, 7, 1), monto: 200 },
  ]
  const p = proyectar({
    modulosTotales: 10, terminados: 4, ritmo: 2, costoModulo: 50,
    comprado: 300, serieReal: serie, hoy: new Date(2026, 8, 15),
  })
  console.assert(p.restantes === 6, `restantes 6, dio ${p.restantes}`)
  console.assert(p.mesesRestantes === 3, `3 meses, dio ${p.mesesRestantes}`)
  console.assert(p.faltante === 300 && p.totalProyectado === 600, 'faltante y total proyectado')
  console.assert(p.curva.length === 5, `2 reales + 3 proyectados, dio ${p.curva.length}`)
  console.assert(p.curva[1].acumulado === 300 && p.curva[4].acumulado === 600, 'acumulado encadena real y proyección')
  console.assert(p.curva[2].mes === 'Oct 2026', `proyección arranca el mes siguiente, dio ${p.curva[2].mes}`)
  console.assert(p.curva[2].real === null && p.curva[1].proyectado === null, 'real y proyectado no se mezclan')
  console.assert(p.fechaTermino?.getMonth() === 11 && p.fechaTermino?.getFullYear() === 2026, 'termina en Dic 2026')

  // Ritmo fraccionario: 5 módulos a 2/mes son 2 meses enteros + medio mes.
  const frac = proyectar({
    modulosTotales: 5, terminados: 0, ritmo: 2, costoModulo: 10,
    comprado: 0, serieReal: [], hoy: new Date(2026, 0, 10),
  })
  console.assert(frac.curva.length === 3, `2 enteros + 1 parcial, dio ${frac.curva.length}`)
  console.assert(frac.curva[2].proyectado === 10, `mes parcial vale la mitad, dio ${frac.curva[2].proyectado}`)
  console.assert(Math.round(frac.curva[2].acumulado) === 50, 'acumulado cierra en el faltante total')

  const sinRitmo = proyectar({
    modulosTotales: 10, terminados: 1, ritmo: 0, costoModulo: 50,
    comprado: 0, serieReal: [], hoy: new Date(2026, 0, 1),
  })
  console.assert(sinRitmo.fechaTermino === null && sinRitmo.curva.length === 0, 'ritmo 0 no proyecta')

  const ritmoSerie = [
    { fecha: new Date(2026, 5, 1), modulos: 47 },
    { fecha: new Date(2026, 6, 1), modulos: 47 },
    { fecha: new Date(2026, 7, 1), modulos: 54 },
    { fecha: new Date(2026, 8, 1), modulos: 26 },
  ]
  const r = ritmoObservado(ritmoSerie, 3, new Date(2026, 8, 9))
  console.assert(r != null && Math.abs(r - 148 / 3) < 1e-9, `ritmo ignora el mes en curso, dio ${r}`)
  console.assert(ritmoObservado([], 3) === null, 'sin serie no hay ritmo')

  console.log('proyeccionCostos demo OK')
}

if (typeof process !== 'undefined' && process.argv?.[1]?.includes('proyeccionCostos')) demo()
