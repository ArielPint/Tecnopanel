import logoTecnopanel from '@/assets/tecnopanel-logo-color.png'
import { cargarJsPDF } from '@/lib/cargarLibrerias'
import { CLASE, CRITERIOS, type Clase, type Evaluacion } from './api'

// Carta al proveedor con el resultado de su evaluación (mismo texto que TP Control Tower): el tono depende
// de la clase, destaca las mejores notas y convierte las más bajas en aspectos a mejorar.

const PERFIL: Record<Clase, { titulo: string; apertura: string; cierre: string }> = {
  A: {
    titulo: 'Desempeño sobresaliente',
    apertura:
      'El resultado obtenido refleja un desempeño sobresaliente y consistente durante el período evaluado. Valoramos el nivel de servicio entregado y esperamos mantener este estándar en las próximas operaciones.',
    cierre: 'Agradecemos el compromiso demostrado y esperamos continuar fortaleciendo nuestra relación comercial.',
  },
  B: {
    titulo: 'Desempeño satisfactorio',
    apertura:
      'El resultado obtenido refleja un desempeño satisfactorio y permite mantener al proveedor en condición aprobada. Se identifican oportunidades puntuales de mejora que contribuirán a fortalecer el servicio y la continuidad de suministro.',
    cierre: 'Agradecemos su colaboración y solicitamos considerar los puntos de mejora señalados para continuar elevando el nivel de servicio.',
  },
  C: {
    titulo: 'Desempeño con observaciones',
    apertura:
      'El resultado obtenido mantiene al proveedor aprobado con observaciones. Se identificaron brechas que requieren seguimiento y acciones de mejora para asegurar un desempeño más estable en los próximos períodos.',
    cierre: 'Solicitamos priorizar las acciones indicadas y revisar su avance en la próxima evaluación acordada.',
  },
  D: {
    titulo: 'Desempeño crítico',
    apertura:
      'El resultado obtenido evidencia brechas relevantes respecto del nivel esperado. Se requiere un plan de acción correctivo y una revisión cercana de los compromisos definidos para asegurar la continuidad de la relación comercial.',
    cierre:
      'Agradecemos enviar y ejecutar las medidas correctivas acordadas dentro de los plazos definidos, las que serán revisadas en la próxima evaluación.',
  },
}

const f = (s: string | null) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString('es-CL') : '')

export function fortalezas(e: Evaluacion) {
  return CRITERIOS.filter((c) => e[c.campo] >= 4)
    .sort((a, b) => e[b.campo] - e[a.campo] || b.peso - a.peso)
    .slice(0, 4)
    .map((c) => `${c.label} (${e[c.campo]}/5)`)
}

export function mejoras(e: Evaluacion) {
  const bajas = CRITERIOS.filter((c) => e[c.campo] <= 3).sort((a, b) => e[a.campo] - e[b.campo] || b.peso - a.peso)
  // sin brechas de 3 o menos, las dos notas más bajas bajo 5 como seguimiento preventivo
  const lista = bajas.length ? bajas : [...CRITERIOS].sort((a, b) => e[a.campo] - e[b.campo] || b.peso - a.peso).slice(0, 2).filter((c) => e[c.campo] < 5)
  return lista.map((c) => `${c.label} (${e[c.campo]}/5): ${c.mejora}`)
}

/** El logo como data URL (jsPDF no descarga imágenes por su cuenta). */
async function logoDataUrl(): Promise<string | null> {
  try {
    const blob = await (await fetch(logoTecnopanel)).blob()
    return await new Promise((ok, mal) => {
      const r = new FileReader()
      r.onload = () => ok(String(r.result))
      r.onerror = mal
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function descargarCarta(e: Evaluacion) {
  const [JsPDF, logo] = await Promise.all([cargarJsPDF(), logoDataUrl()])
  const doc = new JsPDF({ unit: 'mm', format: 'letter' })
  const ancho = doc.internal.pageSize.getWidth() - 40
  const alto = doc.internal.pageSize.getHeight()
  let y = 22
  const linea = (texto: string, opts: { negrita?: boolean; tam?: number; antes?: number } = {}) => {
    y += opts.antes ?? 0
    doc.setFont('helvetica', opts.negrita ? 'bold' : 'normal')
    doc.setFontSize(opts.tam ?? 10.5)
    for (const l of doc.splitTextToSize(texto, ancho) as string[]) {
      if (y > alto - 20) {
        doc.addPage()
        y = 22
      }
      doc.text(l, 20, y)
      y += (opts.tam ?? 10.5) * 0.48
    }
  }
  const perfil = PERFIL[e.clase]
  const periodo = `${f(e.periodo_desde)} al ${f(e.periodo_hasta)}`

  doc.setFillColor(212, 42, 54)
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 6, 'F')
  // logo 491×351 px: 34 × 24,3 mm arriba a la izquierda; el membrete a su derecha
  if (logo) doc.addImage(logo, 'PNG', 20, 11, 34, 24.3)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Área de Abastecimiento', doc.internal.pageSize.getWidth() - 20, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Evaluación de desempeño de proveedores', doc.internal.pageSize.getWidth() - 20, 25, { align: 'right' })
  y = logo ? 44 : 26
  linea(`Santiago, ${f(e.created_at)}`, { antes: 4 })
  linea(`Señores ${e.proveedor_nombre}`, { negrita: true, antes: 6 })
  linea('Presente', {})
  linea(`Asunto: Resultado de evaluación de proveedor · período ${periodo}`, { negrita: true, antes: 6 })
  linea(
    `Junto con saludar, informamos el resultado de la evaluación de desempeño realizada por Tecnopanel. El proveedor obtuvo ${e.puntaje.toLocaleString('es-CL')}/100 puntos, correspondiente a la clasificación ${CLASE[e.clase].label}: ${perfil.titulo.toLowerCase()}.`,
    { antes: 6 },
  )
  linea(perfil.apertura, { antes: 3 })

  linea('Detalle de la evaluación', { negrita: true, antes: 6 })
  y += 1
  doc.setFontSize(9.5)
  for (const c of CRITERIOS) {
    doc.setFont('helvetica', 'normal')
    doc.text(c.label, 24, y)
    doc.text(`${c.peso}%`, 120, y, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.text(`${e[c.campo]}/5`, 140, y, { align: 'right' })
    y += 5
  }

  const fz = fortalezas(e)
  if (fz.length) {
    linea('Fortalezas destacadas', { negrita: true, antes: 4 })
    fz.forEach((x) => linea(`•  ${x}`, { antes: 1 }))
  }
  const mj = mejoras(e)
  if (mj.length) {
    linea('Aspectos a mejorar', { negrita: true, antes: 4 })
    mj.forEach((x) => linea(`•  ${x}`, { antes: 1 }))
  }
  if (e.observaciones) linea(`Observaciones: ${e.observaciones}`, { antes: 4 })
  if (e.plan_accion) linea(`Plan de acción / acuerdos: ${e.plan_accion}`, { antes: 3 })
  if (e.proxima_revision) linea(`Próxima revisión: ${f(e.proxima_revision)}`, { antes: 3 })
  linea(perfil.cierre, { antes: 6 })
  linea('Atentamente,', { antes: 6 })
  linea(e.creado_por_nombre ?? '', { negrita: true, antes: 8 })
  linea('Área de Abastecimiento · Tecnopanel', {})

  const nombre = e.proveedor_nombre.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)
  doc.save(`Evaluacion_${nombre}_${e.periodo_hasta}.pdf`)
}
