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

function buildBodyBloque(numero: number, grupoNombre: string, responsableNombre: string, items: ItemSolicitud[], observacion: string | null) {
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
  return [
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
}

export function buildMailto(numero: number, grupoNombre: string, responsableNombre: string, items: ItemSolicitud[], observacion: string | null) {
  const body = buildBodyBloque(numero, grupoNombre, responsableNombre, items, observacion)
  return `mailto:?subject=${encodeURIComponent(buildMailtoSubject(numero, grupoNombre))}&body=${encodeURIComponent(body)}`
}

export interface SolicitudParaEmail {
  numero: number
  grupoNombre: string
  responsableNombre: string
  items: ItemSolicitud[]
  observacion: string | null
}

export function buildMailtoSubjectAgrupado(numeros: number[]) {
  const now = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `Solicitudes de materiales N° ${numeros.join(', ')} · ${now}`
}

export function buildMailtoAgrupado(solicitudes: SolicitudParaEmail[]) {
  const body = solicitudes
    .map((s) => buildBodyBloque(s.numero, s.grupoNombre, s.responsableNombre, s.items, s.observacion))
    .join(`\n\n${'='.repeat(40)}\n\n`)
  const subject = buildMailtoSubjectAgrupado(solicitudes.map((s) => s.numero))
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
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

export function buildEmailHtmlTableAgrupado(solicitudes: SolicitudParaEmail[]) {
  const bloques = solicitudes
    .map((s) => buildEmailHtmlTable(s.numero, s.grupoNombre, s.responsableNombre, s.items, s.observacion))
    .join('<hr style="margin:16px 0;border:none;border-top:1px solid #ccc">')
  return `<div>${bloques}</div>`
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
