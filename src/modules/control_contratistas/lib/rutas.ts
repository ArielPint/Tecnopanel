// Rutas del portal Control de Contratistas, en un solo lugar.
export const RUTA = {
  inicio: '/control-contratistas',
  login: '/control-contratistas/login',
  documentacion: '/control-contratistas/documentacion',
  estadosPago: '/control-contratistas/estados-pago',
  empresas: '/control-contratistas/empresas',
  contratista: (id: string) => `/control-contratistas/empresas/${id}`,
}
