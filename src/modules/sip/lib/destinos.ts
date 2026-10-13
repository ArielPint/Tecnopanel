import type { Proyecto, ProyectoPropio, ProyectoSap } from './api'

// El proyecto de una línea es un proyecto de SAP (sap_proyecto_codigo, sincronizado desde HANA), una
// obra del hub (proyecto_id, como La Chacra) o un proyecto propio del portal (pnl_proyecto_id). En los
// <select> van juntos con un prefijo: 's:<código SAP>', 'h:<id>' u 'p:<id>'.

export interface OpcionDestino {
  valor: string
  nombre: string
  activo: boolean
}

export interface Destinos {
  sap: OpcionDestino[]
  obras: OpcionDestino[]
  propios: OpcionDestino[]
}

export function opcionesDestino(obras: Proyecto[], propios: ProyectoPropio[], sap: ProyectoSap[]): Destinos {
  return {
    sap: sap.map<OpcionDestino>((s) => ({ valor: `s:${s.codigo}`, nombre: `${s.codigo} · ${s.nombre}`, activo: s.activo })),
    obras: obras.map<OpcionDestino>((o) => ({ valor: `h:${o.id}`, nombre: o.nombre, activo: true })),
    propios: propios.map<OpcionDestino>((p) => ({ valor: `p:${p.id}`, nombre: p.nombre, activo: p.activo })),
  }
}

type ConDestino = { proyecto_id: string | null; pnl_proyecto_id: string | null; sap_proyecto_codigo: string | null }

export function aDestino(l: ConDestino): string {
  if (l.sap_proyecto_codigo) return `s:${l.sap_proyecto_codigo}`
  if (l.proyecto_id) return `h:${l.proyecto_id}`
  if (l.pnl_proyecto_id) return `p:${l.pnl_proyecto_id}`
  return ''
}

export function deDestino(valor: string): ConDestino {
  const vacio: ConDestino = { proyecto_id: null, pnl_proyecto_id: null, sap_proyecto_codigo: null }
  if (valor.startsWith('s:')) return { ...vacio, sap_proyecto_codigo: valor.slice(2) }
  if (valor.startsWith('h:')) return { ...vacio, proyecto_id: valor.slice(2) }
  if (valor.startsWith('p:')) return { ...vacio, pnl_proyecto_id: valor.slice(2) }
  return vacio
}
