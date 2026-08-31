export interface Proyecto {
  id: string
  nombre: string
  slug: string
  descripcion: string | null
  tipo: string
  estado: string
  color_icon: string | null
  url_app: string | null
  sucursal: string | null
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
// Set de indicadores validado con el usuario (2026-07-23): 6 de La Chacra +
// 3 de CRM, ver memory/tecnopanel_hub_design_system.md.
export const KPI_LABELS: Record<string, string> = {
  // La Chacra (por proyecto y agregados)
  avance_fisico: '% Avance físico',
  avance_economico: '% Avance económico',
  modulos_terminados: 'Módulos terminados',
  modulos_despachados: 'Módulos despachados',
  modulos_en_proceso: 'Módulos en proceso',
  compras_total: 'Total compras',
  // CRM
  oportunidades_abiertas: 'Oportunidades abiertas',
  monto_ganado_mes: 'Monto ganado (mes)',
  tasa_conversion: 'Tasa de conversión',
}

export const LA_CHACRA_KPI_KEYS = [
  'avance_fisico',
  'avance_economico',
  'modulos_terminados',
  'modulos_despachados',
  'modulos_en_proceso',
  'compras_total',
] as const

export const CRM_KPI_KEYS = ['oportunidades_abiertas', 'monto_ganado_mes', 'tasa_conversion'] as const
