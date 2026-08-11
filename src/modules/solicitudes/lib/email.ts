import type { ItemSolicitud } from '../hooks/useSolicitudes'

export const PROYECTO_CONST = '930026194'
export const WIP_CONST = '10010'

function padCol(str: string, len: number) {
  const s = String(str)
  return s.length >= len ? s.slice(0, len - 1) + ' ' : s + ' '.repeat(len - s.length)
}

export function buildMailtoSubject(numero: number, grupoNombre: string) {
  const now = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `Solicitud de materiales N° ${numero} · ${grupoNombre} · ${now}`
}

export function buildMailto(numero: number, grupoNombre: string, responsableNombre: string, items: ItemSolicitud[], observacion: string | null) {
  const now = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const colProy = 12
  const colWip = 8
  const colCod = 12
  const colDesc = 45
  const colUnid = 12
  const header = padCol('PROYECTO', colProy) + padCol('WIP', colWip) + padCol('CODIGO', colCod) + padCol('DESCRIPCION', colDesc) + padCol('Unid. Med', colUnid) + 'Cantidad'
  const sep = '-'.repeat(colProy + colWip + colCod + colDesc + colUnid + 10)
  const lineas = items.map(
    (it) => padCol(PROYECTO_CONST, colProy) + padCol(WIP_CONST, colWip) + padCol(it.codigo, colCod) + padCol(it.descripcion, colDesc) + padCol(it.unidad, colUnid) + it.cantidad_real,
  )
  const body = [
    `N° Solicitud: ${numero}`,
    `Grupo: ${grupoNombre}`,
    `Para: ${responsableNombre}`,
    `Fecha: ${now}`,
    '',
    header,
    sep,
    ...lineas,
    '',
    observacion ? `Observaciones: ${observacion}` : '',
  ].join('\n')
  return `mailto:?subject=${encodeURIComponent(buildMailtoSubject(numero, grupoNombre))}&body=${encodeURIComponent(body)}`
}

function escHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function buildEmailHtmlTable(numero: number, grupoNombre: string, responsableNombre: string, items: ItemSolicitud[], observacion: string | null) {
  const now = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const filas = items
    .map(
      (it) => `
    <tr>
      <td style="border:1px solid #999;padding:4px 8px">${escHtml(PROYECTO_CONST)}</td>
      <td style="border:1px solid #999;padding:4px 8px">${escHtml(WIP_CONST)}</td>
      <td style="border:1px solid #999;padding:4px 8px">${escHtml(it.codigo)}</td>
      <td style="border:1px solid #999;padding:4px 8px">${escHtml(it.descripcion)}</td>
      <td style="border:1px solid #999;padding:4px 8px">${escHtml(it.unidad)}</td>
      <td style="border:1px solid #999;padding:4px 8px;text-align:right">${it.cantidad_real}</td>
    </tr>`,
    )
    .join('')
  return `
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#000">
      <p>N° Solicitud: <b>${numero}</b><br>
      Grupo: <b>${escHtml(grupoNombre)}</b><br>
      Para: <b>${escHtml(responsableNombre)}</b><br>
      Fecha: <b>${now}</b></p>
      <table style="border-collapse:collapse;border:1px solid #999">
        <thead>
          <tr style="background:#eee;font-weight:bold">
            <th style="border:1px solid #999;padding:4px 8px">PROYECTO</th>
            <th style="border:1px solid #999;padding:4px 8px">WIP</th>
            <th style="border:1px solid #999;padding:4px 8px">CODIGO</th>
            <th style="border:1px solid #999;padding:4px 8px">DESCRIPCION</th>
            <th style="border:1px solid #999;padding:4px 8px">Unid. Med</th>
            <th style="border:1px solid #999;padding:4px 8px">Cantidad</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      ${observacion ? `<p>Observaciones: ${escHtml(observacion)}</p>` : ''}
    </div>`
}

export async function copyHtmlTableToClipboard(html: string): Promise<boolean> {
  if (!navigator.clipboard || !window.ClipboardItem) return false
  try {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([html.replace(/<[^>]+>/g, ' ')], { type: 'text/plain' }),
    })
    await navigator.clipboard.write([item])
    return true
  } catch {
    return false
  }
}
