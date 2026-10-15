// Rutas del portal Adquisiciones, en un solo lugar.
export const RUTA = {
  inicio: '/adquisiciones',
  login: '/adquisiciones/login',
  nueva: '/adquisiciones/nueva',
  ordenes: '/adquisiciones/ordenes',
  configuracion: '/adquisiciones/configuracion',
  solicitud: (id: string) => `/adquisiciones/${id}`,
}
