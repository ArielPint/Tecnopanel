// Rutas del portal Producción de Paneles SIP, en un solo lugar.
export const RUTA = {
  inicio: '/produccion',
  login: '/produccion/login',
  registro: '/produccion/registro',
  nuevoParte: '/produccion/registro/nuevo',
  parte: (id: string) => `/produccion/registro/${id}`,
  editarParte: (id: string) => `/produccion/registro/${id}/editar`,
  consumo: '/produccion/consumo',
  calculadora: '/produccion/consumo/calculadora',
  recetas: '/produccion/recetas',
  materiales: '/produccion/recetas/materiales',
  proyectos: '/produccion/recetas/proyectos',
  nuevoPanel: '/produccion/recetas/nuevo',
  panel: (id: string) => `/produccion/recetas/${id}`,
}
