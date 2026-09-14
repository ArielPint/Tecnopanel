import type { HitosVit } from '@/modules/crm/types/database'

/** Las 6 etapas internas de un proyecto VIT (columna jsonb oportunidades.hitos_vit).
 *  No son las etapas del pipeline comercial (Clasificación → Oportunidad → Negociación):
 *  son el avance del proyecto dentro de ellas. Fuente única: la usan el drawer, el
 *  dashboard y el Excel de oportunidades. */
export const HITOS_VIT = [
  { n: 1, nombre: 'Diseño y Desarrollo' },
  { n: 2, nombre: 'Ingreso del Proyecto a Serviu' },
  { n: 3, nombre: 'CPI Hábil' },
  { n: 4, nombre: 'Clasificación y Selección' },
  { n: 5, nombre: 'Orden de Compra o Contrato' },
  { n: 6, nombre: 'Ejecución' },
]

/** Una etapa interna cuenta como cumplida solo con el flag Y una descripcion escrita.
 *  Espejo del mismo criterio en public.crm_hitos_vit_pendientes(). */
export function hitoVitCumplido(hitos: HitosVit | null | undefined, n: number): boolean {
  const h = hitos?.[String(n)]
  return !!h?.cumplida && !!h.descripcion?.trim()
}

/** Etapa interna en curso: la primera sin cumplir. Con las 6 cumplidas queda en la última. */
export function etapaVitEnCurso(hitos: HitosVit | null | undefined): number {
  return HITOS_VIT.find(h => !hitoVitCumplido(hitos, h.n))?.n ?? HITOS_VIT.length
}
