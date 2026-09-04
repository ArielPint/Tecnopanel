/** Supabase Storage rechaza con HTTP 400 ("Invalid key") las rutas con caracteres fuera
 *  de su charset: subir "Cotización 1570694.pdf" fallaba siempre, y en Chile los nombres
 *  con tilde o ñ son la norma. Esto normaliza solo la RUTA del objeto; el nombre original
 *  se sigue guardando en la fila del documento, que es lo que ve el usuario. */
export function nombreParaStorage(nombre: string): string {
  const limpio = nombre
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // tildes: ó -> o
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+/, '')
  // Se recorta por el final para no perder la extensión.
  return (limpio.length > 100 ? limpio.slice(-100) : limpio) || 'archivo'
}
