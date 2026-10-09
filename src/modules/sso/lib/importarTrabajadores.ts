import { cargarXLSX } from '@/lib/cargarLibrerias'
import { normalizarRut, rutValido } from './rut'
import type { Area } from './tipos'
import type { Empresa, FichaTrabajador, Trabajador, TrabajadorV } from './tiposTrabajadores'

// Importación de trabajadores desde Excel. El formato definitivo todavía no está definido, así que
// se reconoce cada columna por su encabezado con varios nombres posibles (sin importar tildes,
// mayúsculas ni espacios) y se ofrece una plantilla. La clave es el RUT: si ya existe, se actualiza;
// una celda vacía NO borra lo que la ficha ya tenía.

type Campo =
  | 'rut' | 'nombres' | 'apellidos' | 'paterno' | 'materno' | 'nombreCompleto' | 'empresa' | 'cargo'
  | 'area' | 'fechaIngreso' | 'telefono' | 'email' | 'contacto' | 'observaciones'

const ALIAS: Record<Campo, string[]> = {
  rut: ['rut', 'run', 'ruttrabajador', 'rutdeltrabajador', 'cedula', 'rutrun'],
  nombres: ['nombres', 'nombre', 'primernombre'],
  apellidos: ['apellidos', 'apellido'],
  paterno: ['apellidopaterno', 'paterno'],
  materno: ['apellidomaterno', 'materno'],
  nombreCompleto: ['nombrecompleto', 'trabajador', 'nombreyapellido', 'nombreyapellidos', 'nombreapellido'],
  empresa: ['empresa', 'contratista', 'razonsocial', 'empleador', 'subcontrato'],
  cargo: ['cargo', 'puesto', 'funcion', 'oficio'],
  area: ['area', 'seccion', 'departamento', 'sector'],
  fechaIngreso: ['fechaingreso', 'fechadeingreso', 'ingreso', 'fechacontrato', 'fechadecontrato'],
  telefono: ['telefono', 'celular', 'fono', 'movil', 'telefonomovil'],
  email: ['email', 'correo', 'correoelectronico', 'mail', 'email'],
  contacto: ['contactoemergencia', 'contactodeemergencia', 'encasodeemergencia', 'emergencia'],
  observaciones: ['observaciones', 'observacion', 'obs', 'comentarios', 'notas'],
}

export const COLUMNAS_PLANTILLA = [
  'RUT', 'Nombres', 'Apellidos', 'Empresa', 'Cargo', 'Área', 'Fecha ingreso', 'Teléfono', 'Email', 'Contacto emergencia', 'Observaciones',
]

const clave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())

/** Fecha de una celda: número de serie de Excel, 'dd-mm-aaaa', 'dd/mm/aaaa' o 'aaaa-mm-dd'. */
function fechaCelda(v: unknown): string | null | 'invalida' {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000)
    return d.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return 'invalida'
}

export interface FilaImportacion {
  fila: number
  rut: string
  nombre: string
  estado: 'nuevo' | 'actualiza' | 'error'
  errores: string[]
  avisos: string[]
  ficha: FichaTrabajador | null
  /** empresa del Excel que no está en el catálogo (se crea al importar, si se puede) */
  empresaNueva: string | null
}

export interface ResultadoLectura {
  filas: FilaImportacion[]
  columnas: string[]
  sinReconocer: string[]
  empresasNuevas: string[]
}

interface Contexto {
  empresas: Empresa[]
  areas: Area[]
  existentes: (Trabajador | TrabajadorV)[]
  /** con Configuración se crean las empresas que falten; sin ella, esas filas quedan con error */
  puedeCrearEmpresas: boolean
}

export async function leerExcelTrabajadores(archivo: File, ctx: Contexto): Promise<ResultadoLectura> {
  const XLSX = await cargarXLSX()
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' })
  const hoja = libro.Sheets[libro.SheetNames.find((n) => clave(n) === 'trabajadores') ?? libro.SheetNames[0]]
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true, defval: null, blankrows: false })
  if (matriz.length === 0) return { filas: [], columnas: [], sinReconocer: [], empresasNuevas: [] }

  // la fila de encabezados es la primera que tenga una columna de RUT
  const iEnc = Math.max(0, matriz.findIndex((f) => (f ?? []).some((c) => ALIAS.rut.includes(clave(texto(c))))))
  const encabezados = (matriz[iEnc] ?? []).map((c) => texto(c))
  const columna: Partial<Record<Campo, number>> = {}
  const sinReconocer: string[] = []
  encabezados.forEach((h, i) => {
    if (!h) return
    const campo = (Object.keys(ALIAS) as Campo[]).find((c) => ALIAS[c].includes(clave(h)))
    if (campo && columna[campo] === undefined) columna[campo] = i
    else if (!campo) sinReconocer.push(h)
  })
  // "Nombre" sin columna de apellidos: es el nombre completo
  if (columna.nombres !== undefined && columna.apellidos === undefined && columna.paterno === undefined && columna.nombreCompleto === undefined) {
    columna.nombreCompleto = columna.nombres
    delete columna.nombres
  }

  const empresaPorNombre = new Map(ctx.empresas.map((e) => [clave(e.nombre), e]))
  const areaPorNombre = new Map(ctx.areas.map((a) => [clave(a.nombre), a]))
  const existentePorRut = new Map(ctx.existentes.map((t) => [t.rut, t]))
  const propia = ctx.empresas.find((e) => e.propia) ?? ctx.empresas[0]
  const vistos = new Set<string>()
  const empresasNuevas = new Set<string>()
  const filas: FilaImportacion[] = []

  for (let i = iEnc + 1; i < matriz.length; i++) {
    const celdas = matriz[i] ?? []
    const v = (c: Campo) => (columna[c] === undefined ? '' : texto(celdas[columna[c]!]))
    if (celdas.every((c) => texto(c) === '')) continue

    const errores: string[] = []
    const avisos: string[] = []
    const rut = normalizarRut(v('rut'))
    if (!rut || !rutValido(rut)) errores.push(`RUT inválido: "${v('rut')}"`)
    else if (vistos.has(rut)) errores.push('RUT repetido en el archivo')
    if (rut) vistos.add(rut)

    let nombres = v('nombres')
    let apellidos = v('apellidos') || [v('paterno'), v('materno')].filter(Boolean).join(' ')
    if (!nombres && v('nombreCompleto')) {
      const partes = v('nombreCompleto').split(/\s+/)
      // "Juan Andrés Pérez Soto": los dos últimos son los apellidos
      const corte = partes.length >= 3 ? partes.length - 2 : 1
      nombres = partes.slice(0, corte).join(' ')
      apellidos ||= partes.slice(corte).join(' ')
    }

    const existente = rut ? existentePorRut.get(rut) : undefined
    if (!existente && !nombres) errores.push('Falta el nombre')
    if (!existente && !apellidos) errores.push('Faltan los apellidos')

    let empresa_id = existente?.empresa_id ?? propia?.id ?? ''
    let empresaNueva: string | null = null
    if (v('empresa')) {
      const e = empresaPorNombre.get(clave(v('empresa')))
      if (e) empresa_id = e.id
      else if (ctx.puedeCrearEmpresas) {
        empresaNueva = v('empresa')
        empresasNuevas.add(empresaNueva)
        avisos.push(`Se creará la empresa "${empresaNueva}"`)
      } else errores.push(`La empresa "${v('empresa')}" no existe (pide que la agreguen en Configuración)`)
    }

    let area_id = existente?.area_id ?? null
    if (v('area')) {
      const a = areaPorNombre.get(clave(v('area')))
      if (a) area_id = a.id
      else avisos.push(`El área "${v('area')}" no existe: queda sin cambio`)
    }

    let fecha_ingreso = existente?.fecha_ingreso ?? null
    const f = fechaCelda(columna.fechaIngreso === undefined ? null : celdas[columna.fechaIngreso])
    if (f === 'invalida') avisos.push(`Fecha de ingreso no reconocida: "${v('fechaIngreso')}"`)
    else if (f) fecha_ingreso = f

    // celda vacía = se conserva lo que tenía la ficha
    const o = (c: Campo, actual: string | null | undefined) => v(c) || actual || null
    const ficha: FichaTrabajador | null = errores.length
      ? null
      : {
          rut: rut!,
          nombres: nombres || existente!.nombres,
          apellidos: apellidos || existente!.apellidos,
          empresa_id,
          cargo: o('cargo', existente?.cargo),
          area_id,
          fecha_ingreso,
          telefono: o('telefono', existente?.telefono),
          email: o('email', existente?.email),
          contacto_emergencia: o('contacto', existente?.contacto_emergencia),
          observaciones: o('observaciones', existente?.observaciones),
        }

    filas.push({
      fila: i + 1,
      rut: rut ?? v('rut'),
      nombre: [nombres, apellidos].filter(Boolean).join(' ') || (existente ? `${existente.nombres} ${existente.apellidos}` : ''),
      estado: errores.length ? 'error' : existente ? 'actualiza' : 'nuevo',
      errores,
      avisos,
      ficha,
      empresaNueva,
    })
  }

  return { filas, columnas: encabezados.filter(Boolean), sinReconocer, empresasNuevas: [...empresasNuevas] }
}

/** Plantilla: hoja "Trabajadores" vacía con los encabezados y hoja "Instrucciones" con los valores válidos. */
export async function descargarPlantilla(empresas: Empresa[], areas: Area[]) {
  const XLSX = await cargarXLSX()
  const libro = XLSX.utils.book_new()
  const hoja = XLSX.utils.aoa_to_sheet([COLUMNAS_PLANTILLA])
  hoja['!cols'] = COLUMNAS_PLANTILLA.map((c) => ({ wch: Math.max(14, c.length + 4) }))
  XLSX.utils.book_append_sheet(libro, hoja, 'Trabajadores')
  const instrucciones = [
    ['Columna', 'Obligatoria', 'Detalle'],
    ['RUT', 'Sí', 'Con o sin puntos y guion (12.345.678-5 o 123456785). Si ya existe, la ficha se actualiza.'],
    ['Nombres', 'Sí (si es nuevo)', 'También sirve una sola columna "Nombre completo".'],
    ['Apellidos', 'Sí (si es nuevo)', 'También sirven "Apellido paterno" y "Apellido materno".'],
    ['Empresa', 'No', 'Vacía = Tecnopanel. Debe ser una de las empresas de abajo (o se crea si quien importa tiene Configuración).'],
    ['Cargo', 'No', 'Texto libre.'],
    ['Área', 'No', 'Una de las áreas de abajo.'],
    ['Fecha ingreso', 'No', 'Fecha de Excel o dd-mm-aaaa.'],
    ['Teléfono / Email / Contacto emergencia / Observaciones', 'No', 'Texto libre.'],
    [],
    ['Una celda vacía no borra lo que la ficha ya tenía.'],
    [],
    ['Empresas válidas', ...empresas.map((e) => e.nombre)],
    ['Áreas válidas', ...areas.filter((a) => a.activa).map((a) => a.nombre)],
  ]
  const hojaI = XLSX.utils.aoa_to_sheet(instrucciones)
  hojaI['!cols'] = [{ wch: 48 }, { wch: 16 }, { wch: 90 }]
  XLSX.utils.book_append_sheet(libro, hojaI, 'Instrucciones')
  XLSX.writeFile(libro, 'plantilla-trabajadores.xlsx')
}

function serialExcel(f: string | null): number | null {
  if (!f) return null
  return (Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86_400_000
}

/** Exporta la lista (con las mismas columnas de la plantilla: se puede editar y volver a importar). */
export async function exportarTrabajadoresExcel(lista: TrabajadorV[], nombreArea: (id: string | null) => string, conSalud: boolean) {
  const XLSX = await cargarXLSX()
  const filas = lista.map((t) => ({
    RUT: t.rut,
    Nombres: t.nombres,
    Apellidos: t.apellidos,
    Empresa: t.empresa,
    Cargo: t.cargo ?? '',
    Área: t.area_id ? nombreArea(t.area_id) : '',
    'Fecha ingreso': serialExcel(t.fecha_ingreso),
    Teléfono: t.telefono ?? '',
    Email: t.email ?? '',
    'Contacto emergencia': t.contacto_emergencia ?? '',
    Observaciones: t.observaciones ?? '',
    Estado: t.activo ? 'Activo' : `De baja desde ${t.fecha_baja ?? ''}`,
    ...(conSalud
      ? { 'Exámenes vencidos': t.examenes_vencidos, 'Exámenes por vencer (30 días)': t.examenes_por_vencer, 'Con restricción / no apto': t.examenes_con_restriccion }
      : {}),
  }))
  const hoja = XLSX.utils.json_to_sheet(filas)
  for (let r = 1; r <= filas.length; r++) {
    const c = hoja[XLSX.utils.encode_cell({ r, c: 6 })]
    if (c && typeof c.v === 'number') c.z = 'dd-mm-yyyy'
  }
  hoja['!cols'] = [12, 22, 22, 20, 20, 24, 12, 14, 26, 26, 30, 20, 10, 10, 10].map((wch) => ({ wch }))
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Trabajadores')
  const sello = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
  XLSX.writeFile(libro, `prevencion-trabajadores-${sello}.xlsx`)
}
