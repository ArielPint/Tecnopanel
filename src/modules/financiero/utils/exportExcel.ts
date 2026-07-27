import * as XLSX from 'xlsx'

export function exportarExcel(nombreArchivo: string, filas: Record<string, unknown>[]) {
  const hoja = XLSX.utils.json_to_sheet(filas)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Datos')
  XLSX.writeFile(libro, `${nombreArchivo}.xlsx`)
}
