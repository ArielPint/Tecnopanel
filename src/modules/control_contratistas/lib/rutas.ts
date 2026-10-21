// Rutas del portal Control de Contratistas, en un solo lugar.
export const RUTA = {
  inicio: '/control-contratistas',
  login: '/control-contratistas/login',
  contratistas: '/control-contratistas',
  contratista: (id: string) => `/control-contratistas/${id}`,
}
