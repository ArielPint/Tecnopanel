// Las fotos de terreno llegan de 4-12 MB desde el celular. Sin achicarlas el Storage pasa de
// ~20 MB a GB en meses, y eso pega directo en el respaldo nocturno del servidor propio.
const LADO_MAXIMO = 1600
const CALIDAD = 0.82

export async function comprimirImagen(archivo: File): Promise<File> {
  let bitmap: ImageBitmap
  try {
    // from-image: respeta la orientación EXIF (si no, las fotos del celular salen giradas)
    bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(`No se pudo leer "${archivo.name}" como imagen. Usa JPG, PNG o WebP.`)
  }
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
  const ancho = Math.round(bitmap.width * escala)
  const alto = Math.round(bitmap.height * escala)

  const canvas = document.createElement('canvas')
  canvas.width = ancho
  canvas.height = alto
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('El navegador no permite procesar imágenes')
  ctx.drawImage(bitmap, 0, 0, ancho, alto)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', CALIDAD))
  if (!blob) throw new Error(`No se pudo comprimir "${archivo.name}"`)
  const nombre = archivo.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], nombre, { type: 'image/jpeg' })
}
