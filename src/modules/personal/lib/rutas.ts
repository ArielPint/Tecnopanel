// Rutas del portal Ingreso de Personal, en un solo lugar.
export const RUTA = {
  inicio: '/personal',
  login: '/personal/login',
  nueva: '/personal/nueva',
  configuracion: '/personal/configuracion',
  contratistas: '/personal/contratistas',
  contratista: (id: string) => `/personal/contratistas/${id}`,
  ingreso: (id: string) => `/personal/${id}`,
}
