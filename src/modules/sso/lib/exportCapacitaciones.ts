import type { WorkSheet } from 'xlsx'
import { cargarXLSX, type XLSXLib } from '@/lib/cargarLibrerias'
import type { Asistente, CapacitacionV } from './apiCapacitaciones'
import type { TrabajadorV } from './tiposTrabajadores'

const serial = (f: string) => (Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86_400_000

function conFechas(XLSX: XLSXLib, hoja: WorkSheet, columna: number, filas: number) {
  for (let r = 1; r <= filas; r++) {
    const c = hoja[XLSX.utils.encode_cell({ r, c: columna })]
    if (c && typeof c.v === 'number') c.z = 'dd-mm-yyyy'
  }
}

/** Dos hojas: el registro de capacitaciones y la asistencia (una fila por persona). */
export async function exportarCapacitacionesExcel(
  caps: CapacitacionV[],
  asistentes: Asistente[],
  trabajadores: TrabajadorV[],
  nombreArea: (id: string | null) => string,
) {
  const XLSX = await cargarXLSX()
  const porId = new Map(trabajadores.map((t) => [t.id, t]))
  const registro = caps.map((c) => ({
    Fecha: serial(c.fecha),
    Tipo: c.tipo,
    Tema: c.tema,
    'Duración (min)': c.duracion_min,
    Relator: c.relator,
    Área: c.area_id ? nombreArea(c.area_id) : 'Toda la empresa',
    Lugar: c.lugar ?? '',
    Asistentes: c.asistentes,
    Ausentes: c.ausentes,
    'Horas-hombre': c.horas_hombre,
    'Lista firmada': c.evidencia_path ? 'Sí' : 'No',
  }))
  const capPorId = new Map(caps.map((c) => [c.id, c]))
  const asistencia = asistentes
    .filter((a) => capPorId.has(a.capacitacion_id))
    .map((a) => {
      const c = capPorId.get(a.capacitacion_id)!
      const t = porId.get(a.trabajador_id)
      return {
        Fecha: serial(c.fecha),
        Tipo: c.tipo,
        Tema: c.tema,
        RUT: t?.rut ?? '',
        Trabajador: t ? `${t.apellidos}, ${t.nombres}` : '',
        Empresa: t?.empresa ?? '',
        Cargo: t?.cargo ?? '',
        Asistió: a.asistio ? 'Sí' : 'No',
      }
    })
    .sort((x, y) => y.Fecha - x.Fecha || x.Trabajador.localeCompare(y.Trabajador))

  const libro = XLSX.utils.book_new()
  const h1 = XLSX.utils.json_to_sheet(registro)
  conFechas(XLSX, h1, 0, registro.length)
  h1['!cols'] = [12, 24, 40, 10, 26, 24, 20, 10, 10, 12, 10].map((wch) => ({ wch }))
  XLSX.utils.book_append_sheet(libro, h1, 'Capacitaciones')
  const h2 = XLSX.utils.json_to_sheet(asistencia)
  conFechas(XLSX, h2, 0, asistencia.length)
  h2['!cols'] = [12, 24, 40, 12, 30, 24, 22, 8].map((wch) => ({ wch }))
  XLSX.utils.book_append_sheet(libro, h2, 'Asistencia')
  const sello = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
  XLSX.writeFile(libro, `prevencion-capacitaciones-${sello}.xlsx`)
}
