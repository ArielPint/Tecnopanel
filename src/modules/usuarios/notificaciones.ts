/**
 * Avisos que pueden llegar por correo, agrupados por portal. La clave '<origen>:<grupo>' es la misma que
 * calculan las tareas del servidor (stack\tareas\correos-notificaciones.ps1 y correos-ingreso.ps1): si se
 * cambia aquí, cambiarla también allá. En la base se guarda solo lo desactivado, como permisos
 * modulo_key 'sin_correo:<clave>' sobre NOTIF_ANCLA_ID (ver syncNotifSinCorreo).
 */
export const NOTIF_CORREO_GRUPOS: { portal: string; opciones: { clave: string; label: string }[] }[] = [
  {
    portal: 'CRM',
    opciones: [
      { clave: 'crm:oportunidad_nueva', label: 'Nueva oportunidad' },
      { clave: 'crm:asignacion', label: 'Asignaciones (oportunidades y tareas)' },
      { clave: 'crm:etapa_cambio', label: 'Cambio de etapa' },
      { clave: 'crm:estado_final', label: 'Oportunidad ganada o perdida' },
      { clave: 'crm:margen_autorizacion', label: 'Autorización de margen' },
      { clave: 'crm:hitos', label: 'Hitos VIT (fechas modificadas y vencimientos)' },
    ],
  },
  {
    portal: 'Solicitudes de materiales',
    opciones: [{ clave: 'solicitudes:solicitud_nueva', label: 'Nueva solicitud pendiente de envío' }],
  },
  {
    portal: 'Prevención',
    opciones: [
      { clave: 'sso:hallazgos', label: 'Hallazgos: asignación, verificación, rechazo y cierre' },
      { clave: 'sso:hallazgos_plazo', label: 'Hallazgos: por vencer, vencen hoy y vencidos' },
      { clave: 'sso:accidentes', label: 'Accidentes y DIAT pendientes' },
      { clave: 'sso:comite', label: 'Comité Paritario: acuerdos asignados y vencidos' },
      { clave: 'sso:vencimientos', label: 'Resumen diario de vencimientos (documentos, EPP, capacitaciones, exámenes, inspecciones)' },
    ],
  },
  {
    portal: 'Ingreso de personal',
    opciones: [{ clave: 'ingreso:todos', label: 'Avisos de las solicitudes de ingreso' }],
  },
  {
    portal: 'Adquisiciones',
    opciones: [{ clave: 'adquisiciones:todos', label: 'Avisos de solicitudes de compra, aprobaciones y OC' }],
  },
]
