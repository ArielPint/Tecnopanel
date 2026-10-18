// Rutas del portal Adquisiciones, en un solo lugar.
export const RUTA = {
  inicio: '/adquisiciones',
  login: '/adquisiciones/login',
  nueva: '/adquisiciones/nueva',
  dashboard: '/adquisiciones/dashboard',
  ordenes: '/adquisiciones/ordenes',
  presupuestos: '/adquisiciones/presupuestos',
  reposicion: '/adquisiciones/reposicion',
  bodega: '/adquisiciones/bodega',
  planificacion: '/adquisiciones/planificacion',
  planes: '/adquisiciones/planes',
  plan: (id: string) => `/adquisiciones/planes/${id}`,
  proveedores: '/adquisiciones/proveedores',
  proveedor: (codigo: string) => `/adquisiciones/proveedores/${encodeURIComponent(codigo)}`,
  nc: '/adquisiciones/nc',
  configuracion: '/adquisiciones/configuracion',
  solicitud: (id: string) => `/adquisiciones/${id}`,
}
