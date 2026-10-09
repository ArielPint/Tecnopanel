import type * as XLSXTipos from 'xlsx'
import type { jsPDF as JsPDFTipo } from 'jspdf'

// Excel (SheetJS) y PDF (jsPDF) pesan ~220 KB comprimidos entre los dos y solo se usan al
// importar o exportar: se descargan recién la primera vez que hacen falta.

export type XLSXLib = typeof XLSXTipos
export type JsPDF = JsPDFTipo

export function cargarXLSX(): Promise<XLSXLib> {
  return import('xlsx')
}

export async function cargarJsPDF(): Promise<typeof JsPDFTipo> {
  return (await import('jspdf')).default
}
