// Paleta institucional Tecnopanel (rojo + grises del brandbook, ver tailwind.config.js
// `tecnopanel`). Usada en el dashboard Ejecutivo y en la exportación a PPT para que
// la lámina salga con los colores corporativos y no con los del tema del hub.
export const INST = {
  rojo: '#ED3224',
  rojoClaro: '#F2564A',
  rojoOscuro: '#C0241A',
  plomo: '#424243',
  gris: '#8A8A8C',
  grisClaro: '#C9C9CB',
  negro: '#2B2B2C',
} as const

// Series secundarias (forecasts, líneas múltiples): grises de más oscuro a más claro.
export const INST_GRISES = [INST.plomo, INST.gris, INST.grisClaro, INST.negro] as const
