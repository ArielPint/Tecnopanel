import type { TipologiaVitPrecio } from '@/modules/crm/types/database'

// Orden de los grupos en el desplegable; una categoría que no esté aquí va después, y las sin categoría al final.
const ORDEN_CATEGORIAS = ['Viviendas Panelizadas', 'Viviendas Modulares', 'Edificios Modulares']
const SIN_CATEGORIA = 'Otras'

// Opciones del <select> de tipologías VIT agrupadas por categoría (respeta el orden por precio de la consulta).
export default function OpcionesTipologia({ tipologias }: { tipologias: TipologiaVitPrecio[] }) {
  const grupos = new Map<string, TipologiaVitPrecio[]>()
  for (const t of tipologias) {
    const cat = t.categoria || SIN_CATEGORIA
    if (!grupos.has(cat)) grupos.set(cat, [])
    grupos.get(cat)!.push(t)
  }
  const posicion = (cat: string) => {
    const i = ORDEN_CATEGORIAS.indexOf(cat)
    return i >= 0 ? i : cat === SIN_CATEGORIA ? ORDEN_CATEGORIAS.length + 1 : ORDEN_CATEGORIAS.length
  }
  return (
    <>
      {[...grupos.entries()].sort(([a], [b]) => posicion(a) - posicion(b)).map(([cat, ts]) => (
        <optgroup key={cat} label={cat}>
          {ts.map(t => <option key={t.tipologia} value={t.tipologia}>{t.tipologia} ({t.venta_actual_uf} UF)</option>)}
        </optgroup>
      ))}
    </>
  )
}
