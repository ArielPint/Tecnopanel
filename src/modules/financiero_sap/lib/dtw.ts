import type { Informe, LineaFinal } from './rendiciones'

// Archivo de importación de asientos para SAP Business One Data Transfer Workbench (DTW), objeto oJournalEntries.
// Son dos archivos de texto separados por tabulación, en Unicode (UTF-16 LE con BOM), como las plantillas de DTW:
//   cabecera  JournalEntries        una fila por rendición (RecordKey = n.º correlativo del archivo)
//   líneas    JournalEntries_Lines  una fila por línea del asiento (ParentKey = RecordKey de su cabecera)
// Las dos primeras filas son los nombres de campo de DTW y de la base. Fechas AAAAMMDD; montos sin decimales (CLP).
// Reference2 = 'RG-<id del informe>': la sincronización busca ese valor en OJDT.Ref2 para saber que ya está en SAP.
// Línea de socio de negocio (colaborador o proveedor): ShortName = código de socio y AccountCode = su cuenta asociada.

const CABECERA = [
  ['RecordKey', 'ReferenceDate', 'TaxDate', 'DueDate', 'Memo', 'Reference', 'Reference2', 'Reference3'],
  ['JdtNum', 'RefDate', 'TaxDate', 'DueDate', 'Memo', 'Ref1', 'Ref2', 'Ref3'],
]
const LINEAS = [
  ['ParentKey', 'LineNum', 'AccountCode', 'ShortName', 'Debit', 'Credit', 'CostingCode', 'ProjectCode', 'LineMemo', 'Reference1', 'Reference2'],
  ['JdtNum', 'LineNum', 'Account', 'ShortName', 'Debit', 'Credit', 'ProfitCode', 'Project', 'LineMemo', 'Ref1', 'Ref2'],
]

/** Texto apto para una celda: sin tabulaciones ni saltos de línea y con largo máximo. */
const celda = (v: string | number | null | undefined, max = 100) =>
  v === null || v === undefined ? '' : String(v).replace(/[\t\r\n]+/g, ' ').trim().slice(0, max)
const fecha = (iso: string | null) => (iso ?? '').slice(0, 10).replace(/-/g, '')
const monto = (v: number) => (v ? String(Math.round(v)) : '0')

export const memoRendicion = (i: Pick<Informe, 'folio' | 'id' | 'empleado_nombre'>) =>
  celda(`Rendición N°${i.folio ?? i.id} - ${i.empleado_nombre ?? ''}`, 100)

export interface ArchivoDtw {
  nombre: string
  contenido: string
}

/** Arma los dos archivos del lote. Las líneas deben ser las de rg_asiento_final de esos informes. */
export function armarDtw(lote: number, informes: Informe[], lineas: LineaFinal[]): { cabecera: ArchivoDtw; lineas: ArchivoDtw } {
  const cab: string[][] = [...CABECERA]
  const lin: string[][] = [...LINEAS]
  informes.forEach((i, n) => {
    const clave = String(n + 1)
    const f = fecha(i.fecha_asiento)
    const memo = memoRendicion(i)
    cab.push([clave, f, f, f, memo, celda(i.folio ?? i.id, 100), `RG-${i.id}`, `Portal lote ${lote}`])
    lineas
      .filter((l) => l.informe_id === i.id)
      .sort((a, b) => a.linea - b.linea)
      .forEach((l, k) => {
        lin.push([
          clave,
          String(k),
          celda(l.cuenta, 15),
          celda(l.socio, 15),
          monto(l.debe),
          monto(l.haber),
          celda(l.ceco, 8),
          celda(l.proyecto, 20),
          celda(l.glosa ?? memo, 100),
          celda(i.folio ?? i.id, 100),
          `RG-${i.id}`,
        ])
      })
  })
  const texto = (filas: string[][]) => filas.map((f) => f.join('\t')).join('\r\n') + '\r\n'
  return {
    cabecera: { nombre: `JournalEntries_lote${lote}.txt`, contenido: texto(cab) },
    lineas: { nombre: `JournalEntries_Lines_lote${lote}.txt`, contenido: texto(lin) },
  }
}

/** Texto a UTF-16 LE con BOM (el "Texto Unicode" que DTW lee sin problemas de tildes). */
export function utf16le(texto: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(2 + texto.length * 2))
  bytes[0] = 0xff
  bytes[1] = 0xfe
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    bytes[2 + i * 2] = c & 0xff
    bytes[3 + i * 2] = c >> 8
  }
  return bytes
}

export function descargar(archivo: ArchivoDtw) {
  const url = URL.createObjectURL(new Blob([utf16le(archivo.contenido)], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = archivo.nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
