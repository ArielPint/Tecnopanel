import jsPDF from 'jspdf'
import { PROYECTO_CONST, WIP_CONST, type SolicitudParaEmail } from './email'

// Respaldo local de la solicitud, sin depender de email — jsPDF ya está instalado
// en el proyecto (mismo patrón que el presupuesto del CRM), no hace falta backend.
export function descargarSolicitudPdf(data: SolicitudParaEmail) {
  const doc = new jsPDF()
  const now = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(`Solicitud de materiales N° ${data.numero}`, 15, 18)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Grupo: ${data.grupoNombre}`, 15, 28)
  doc.text(`Para: ${data.responsableNombre}`, 15, 34)
  doc.text(`Fecha: ${now}`, 15, 40)

  let y = 52
  doc.setFillColor(26, 26, 27)
  doc.rect(15, y - 5, 180, 7, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('PROYECTO', 17, y)
  doc.text('WIP', 45, y)
  doc.text('CÓDIGO', 60, y)
  doc.text('DESCRIPCIÓN', 85, y)
  doc.text('UNID.', 155, y)
  doc.text('CANT.', 175, y)
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  y += 8

  for (const it of data.items) {
    if (y > 275) {
      doc.addPage()
      y = 20
    }
    doc.text(PROYECTO_CONST, 17, y)
    doc.text(WIP_CONST, 45, y)
    doc.text(it.codigo, 60, y)
    doc.text(doc.splitTextToSize(it.descripcion, 65), 85, y)
    doc.text(it.unidad, 155, y)
    doc.text(String(it.cantidad_real), 175, y)
    y += 6
  }

  if (data.observacion) {
    if (y > 260) {
      doc.addPage()
      y = 20
    }
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.text('Observaciones:', 15, y)
    doc.setFont('helvetica', 'normal')
    y += 5
    doc.text(doc.splitTextToSize(data.observacion, 180), 15, y)
  }

  doc.save(`solicitud-${data.numero}.pdf`)
}
