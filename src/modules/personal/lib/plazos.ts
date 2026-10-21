import { diasHabiles, feriadosFijos } from '@/modules/sip/lib/proyeccion'
import { sumarDias } from '@/modules/sso/lib/estados'
import { DIAS_AVISO } from './catalogos'

// Anticipación de la solicitud: el procedimiento pide la fecha de ingreso con DIAS_AVISO días hábiles
// (lunes a viernes, sin feriados fijos). Es un aviso: no impide crear la solicitud.

function esHabil(f: string): boolean {
  const dow = new Date(`${f}T12:00:00Z`).getUTCDay()
  return dow !== 0 && dow !== 6 && !feriadosFijos(+f.slice(0, 4)).has(f)
}

/** Primera fecha de ingreso que cumple el aviso si se pide el día `desde`. */
export function fechaMinimaAviso(desde: string): string {
  let f = desde
  for (let n = 0; n < DIAS_AVISO; ) {
    f = sumarDias(f, 1)
    if (esHabil(f)) n++
  }
  return f
}

/** Días hábiles entre el día en que se pidió (sin contarlo) y la fecha de ingreso. */
export function diasHabilesAviso(pedidoEl: string, fechaIngreso: string): number {
  return fechaIngreso > pedidoEl ? diasHabiles(sumarDias(pedidoEl, 1), fechaIngreso) : 0
}

/** Fecha 'YYYY-MM-DD' en Chile de un timestamp de la base. */
export function fechaChile(ts: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(ts))
}
