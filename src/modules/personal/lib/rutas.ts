// Rutas del portal Ingreso de Personal, en un solo lugar.
export const RUTA = {
  inicio: '/personal',
  login: '/personal/login',
  nueva: '/personal/nueva',
  ingreso: (id: string) => `/personal/${id}`,
}
