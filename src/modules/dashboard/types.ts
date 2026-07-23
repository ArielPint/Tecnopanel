export interface Proyecto {
  id: string
  nombre: string
  slug: string
  descripcion: string | null
  tipo: string
  estado: string
  color_icon: string | null
  url_app: string | null
  created_at: string
}

export interface ProjectKpi {
  id: string
  proyecto_id: string
  key: string
  valor: number
  timestamp: string
}

// Etiquetas legibles para las keys de KPI esperadas (ver PROMPT_TECNOPANEL_HUB.md).
// Fase 3 es la responsable de poblar project_kpis con estos valores reales.
export const KPI_LABELS: Record<string, string> = {
  // La Chacra
  modulos_completados: 'Módulos completados',
  avance_porcentaje: '% Avance',
  torres_totales: 'Torres',
  // CRM
  oportunidades_pipeline: 'Oportunidades (pipeline)',
  pipeline_total: 'Pipeline total ($)',
  tasa_cierre: 'Tasa de cierre (%)',
  ingresos: 'Ingresos ($)',
}
