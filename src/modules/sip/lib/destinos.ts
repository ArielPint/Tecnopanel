import type { Proyecto, ProyectoPropio } from './api'

// El proyecto de una línea es una obra del hub (proyecto_id, como La Chacra) o un proyecto propio del
// portal (pnl_proyecto_id). En los <select> van juntos con un prefijo: 'h:<id>' u 'p:<id>'.

export interface OpcionDestino {
  valor: string
  nombre: string
  activo: boolean
}

export function opcionesDestino(obras: Proyecto[], propios: ProyectoPropio[]) {
  return {
    obras: obras.map<OpcionDestino>((o) => ({ valor: `h:${o.id}`, nombre: o.nombre, activo: true })),
    propios: propios.map<OpcionDestino>((p) => ({ valor: `p:${p.id}`, nombre: p.nombre, activo: p.activo })),
  }
}

export function aDestino(l: { proyecto_id: string | null; pnl_proyecto_id: string | null }): string {
  if (l.proyecto_id) return `h:${l.proyecto_id}`
  if (l.pnl_proyecto_id) return `p:${l.pnl_proyecto_id}`
  return ''
}

export function deDestino(valor: string): { proyecto_id: string | null; pnl_proyecto_id: string | null } {
  if (valor.startsWith('h:')) return { proyecto_id: valor.slice(2), pnl_proyecto_id: null }
  if (valor.startsWith('p:')) return { proyecto_id: null, pnl_proyecto_id: valor.slice(2) }
  return { proyecto_id: null, pnl_proyecto_id: null }
}
