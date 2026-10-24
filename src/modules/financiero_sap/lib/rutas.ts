// Rutas del portal Financiero, en un solo lugar. No confundir con el financiero de cada obra
// (/proyectos/:slug/financiero, módulo modules/financiero).
export const RUTA = {
  inicio: '/financiero',
  login: '/financiero/login',
  lineas: '/financiero/lineas',
  ventas: '/financiero/ventas',
  prorrateo: '/financiero/prorrateo',
  balance: '/financiero/balance',
  ifrs: '/financiero/ifrs',
  clasificacion: '/financiero/clasificacion-ifrs',
  rendiciones: '/financiero/rendiciones',
  rendicionesCuentas: '/financiero/rendiciones/cuentas',
  rendicionesLotes: '/financiero/rendiciones/lotes',
  rendicion: (id: number) => `/financiero/rendiciones/${id}`,
}
