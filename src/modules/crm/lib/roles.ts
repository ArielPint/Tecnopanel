// Roles definidos en el sistema con sus etiquetas y colores
export const ROL_META: Record<string, { label: string; badge: string; descripcion: string }> = {
  admin:           { label:'Admin',            badge:'bg-red-100 text-red-700',     descripcion:'Acceso total al sistema' },
  gerente_general: { label:'Gerente General',  badge:'bg-purple-100 text-purple-700', descripcion:'Supervisión general y reportes' },
  gerente_ventas:  { label:'Gerente Ventas',   badge:'bg-indigo-100 text-indigo-700', descripcion:'Gestión del equipo de ventas' },
  vendedor:        { label:'Vendedor',          badge:'bg-blue-100 text-blue-700',   descripcion:'Gestión de oportunidades y clientes' },
  jefe_ingenieria: { label:'Jefe Ingeniería',  badge:'bg-cyan-100 text-cyan-700',   descripcion:'Coordinación del equipo técnico' },
  ingeniero:       { label:'Ingeniero',         badge:'bg-teal-100 text-teal-700',   descripcion:'Tareas de ingeniería y cubicación' },
  cubicador:       { label:'Cubicador',         badge:'bg-green-100 text-green-700', descripcion:'Cubicación de proyectos' },
  presupuestista:  { label:'Presupuestista',    badge:'bg-lime-100 text-lime-700',   descripcion:'Elaboración de presupuestos' },
  finanzas:        { label:'Finanzas',          badge:'bg-amber-100 text-amber-700', descripcion:'Evaluación crediticia y finanzas' },
  desarrollador:   { label:'Desarrollador',      badge:'bg-fuchsia-100 text-fuchsia-700', descripcion:'Entrega de planos y fichas en etapa Desarrollo' },
}

export const MODULOS = ['Dashboard','Oportunidades','Ingeniería','Ganadas y Perdidas','Desarrollo','Costos y Presupuestos','Negociación','Revisión Vendedor','Clientes','Usuarios']

// Permisos de página que trae un rol por defecto al crearlo (el admin luego puede ajustar por usuario)
export const DEFAULT_MODULOS: Record<string, string[]> = {
  admin:           MODULOS,
  gerente_general: ['Dashboard','Oportunidades','Ingeniería','Ganadas y Perdidas','Desarrollo','Costos y Presupuestos','Negociación','Revisión Vendedor','Clientes'],
  gerente_ventas:  ['Dashboard','Oportunidades','Clientes','Revisión Vendedor'],
  vendedor:        ['Dashboard','Oportunidades','Clientes','Revisión Vendedor'],
  jefe_ingenieria: ['Dashboard','Ingeniería','Ganadas y Perdidas','Desarrollo'],
  ingeniero:       ['Dashboard','Ingeniería','Ganadas y Perdidas'],
  cubicador:       ['Dashboard','Costos y Presupuestos'],
  presupuestista:  ['Dashboard','Costos y Presupuestos','Negociación'],
  finanzas:        ['Dashboard','Negociación'],
  desarrollador:   ['Dashboard','Desarrollo'],
}
