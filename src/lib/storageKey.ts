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

/** Mismo tope que la subida estándar de Storage (50 MB en Supabase y en el servidor propio).
 *  Sin validar antes, un archivo más grande fallaba recién en el servidor, con un mensaje
 *  técnico en inglés ("The object exceeded the maximum allowed size"). */
export const TAMANO_MAXIMO_ARCHIVO_MB = 50

/** null si el archivo se puede subir; si no, el mensaje para mostrarle al usuario. */
export function errorTamanoArchivo(archivo: File): string | null {
  if (archivo.size <= TAMANO_MAXIMO_ARCHIVO_MB * 1024 * 1024) return null
  // Hacia arriba: 50 MB + 1 byte se muestra "50,1 MB", no "50 MB" contra un máximo de 50 MB.
  const mb = (Math.ceil((archivo.size / (1024 * 1024)) * 10) / 10).toLocaleString('es-CL', { maximumFractionDigits: 1 })
  return `El archivo "${archivo.name}" pesa ${mb} MB y el máximo permitido es ${TAMANO_MAXIMO_ARCHIVO_MB} MB. Comprímelo o divídelo antes de subirlo.`
}
