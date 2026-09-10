import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabaseClient'
import { handleSupabaseError } from '@/modules/crm/lib/errors'
import type { HitosVit } from '@/modules/crm/types/database'

// Descarga de TODAS las oportunidades (incluidas Ganadas y Perdidas) en un solo Excel.
// Una hoja por tipo de dato: la hoja Oportunidades es la maestra y las demas se enlazan
// con ella por la columna Codigo.

const TIPO_VENTA_LABELS: Record<string, string> = {
  Proyecto: 'Proyecto',
  Producto: 'Venta Directa',
  Kit: 'Viviendas Industrializadas',
  VIT: 'VIT',
}

// Mismos nombres que muestra la pestaña General del drawer (HITOS_VIT).
const HITOS_VIT_NOMBRES = [
  'Diseño y Desarrollo', 'Ingreso del Proyecto a Serviu', 'CPI Hábil',
  'Clasificación y Selección', 'Orden de Compra o Contrato', 'Ejecución',
]

type Fila = Record<string, unknown>

const lista = (v: string[] | null | undefined) => (v?.length ? v.join(', ') : '')
const fecha = (v: string | null | undefined) => (v ? v.slice(0, 10) : '')
const fechaHora = (v: string | null | undefined) => (v ? v.replace('T', ' ').slice(0, 16) : '')
const dias = (desde: string | null | undefined, hasta: string | null | undefined) => {
  if (!desde) return ''
  const fin = hasta ? new Date(hasta) : new Date()
  return Math.round((fin.getTime() - new Date(desde).getTime()) / 86400000)
}

function hoja(libro: XLSX.WorkBook, nombre: string, filas: Fila[]) {
  if (filas.length === 0) return
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), nombre.slice(0, 31))
}

/** Arma el Excel completo y lo descarga. Devuelve cuantas oportunidades exporto. */
export async function exportarOportunidades(): Promise<number> {
  const [opps, tipologias, hist, tareas, datosEtapa, docs, asigs, mensajes, perfiles, lineas] =
    await Promise.all([
      supabase.from('oportunidades').select('*, cliente:clientes(*)').order('codigo'),
      supabase.from('oportunidad_tipologias').select('*'),
      supabase.from('oportunidad_historial_etapas').select('*').order('fecha_entrada'),
      supabase.from('tareas_ingenieria').select('*').order('created_at'),
      supabase.from('oportunidad_datos_etapa').select('*'),
      supabase.from('oportunidad_documentos').select('*').order('created_at'),
      supabase.from('oportunidad_asignaciones').select('*'),
      supabase.from('mensajes_oportunidad').select('*').order('created_at'),
      supabase.from('crm_perfiles_basicos').select('id,nombre,apellido'),
      supabase.from('lineas_negocio').select('id,nombre'),
    ])

  if (handleSupabaseError(opps.error, 'exportarOportunidades')) return 0

  const nombreDe = new Map<string, string>((perfiles.data ?? []).map(
    (p) => [p.id as string, (p.nombre + ' ' + p.apellido).trim()]))
  const usuario = (id: string | null | undefined) => (id ? nombreDe.get(id) ?? 'Usuario dado de baja' : '')
  const lineaDe = new Map<string, string>((lineas.data ?? []).map((l) => [l.id as string, l.nombre as string]))

  const filas = (opps.data ?? []) as Fila[]
  // Las hojas hijas guardan oportunidad_id; en el Excel va el codigo + nombre.
  const codigoDe = new Map(filas.map((o) => [o.id as string, o.codigo as string]))
  const nombreOpp = new Map(filas.map((o) => [o.id as string, o.nombre as string]))
  const cod = (id: string) => codigoDe.get(id) ?? id
  const nom = (id: string) => nombreOpp.get(id) ?? ''

  const libro = XLSX.utils.book_new()

  hoja(libro, 'Oportunidades', filas.map((o) => {
    const c = (o.cliente ?? {}) as Record<string, string | null>
    const hitos = (o.hitos_vit ?? {}) as HitosVit
    const fila: Fila = {
      'Código': o.codigo,
      'Nombre': o.nombre,
      'Tipo de venta': TIPO_VENTA_LABELS[o.tipo_venta as string] ?? o.tipo_venta,
      'Etapa actual': o.etapa_actual,
      'Probabilidad %': o.probabilidad,
      'Monto estimado': o.monto_estimado,
      'Monto final': o.monto_final,
      'Moneda': o.moneda,
      'Margen %': o.margen_porcentaje,
      'Valor UF': o.valor_uf,
      'Venta actual UF': o.venta_actual_uf,
      'Vendedor': usuario(o.vendedor_id as string | null),
      'Línea de negocio': o.linea_id ? lineaDe.get(o.linea_id as string) ?? '' : '',
      'Sucursal': o.sucursal,
      'Cliente': c.razon_social ?? '',
      'RUT cliente': c.rut ?? '',
      'Tipo cliente': c.tipo ?? '',
      'Rubro cliente': c.rubro ?? '',
      'Ciudad cliente': c.ciudad ?? '',
      'Contacto cliente': c.contacto_nombre ?? '',
      'Email contacto': c.contacto_email ?? '',
      'Fono contacto': c.contacto_fono ?? '',
      'Región': o.region,
      'Comuna': o.comuna,
      'Requiere ingeniería': o.requiere_ingenieria ? 'Sí' : 'No',
      'Familia de productos': lista(o.familia_productos as string[] | null),
      'Alcances': lista(o.alcances as string[] | null),
      'Cantidad de casas': o.cantidad_casas,
      'Tipos de casas': o.cantidad_tipos_casas,
      'Duración estimada (meses)': o.duracion_meses_est,
      'Entidad patrocinante': o.nombre_entidad_patrocinante,
      'Comité de vivienda': o.nombre_comite_vivienda,
      'Constructora': o.nombre_constructora,
      'Tipo de subsidio': o.tipo_subsidio,
      'Programa': o.programa,
      'Zona térmica': o.zona_termica,
      'Tipología VIT': o.tipologia_vit,
      'Fecha ingreso calificación': fecha(o.fecha_ingreso_calificacion as string | null),
      'Estimación calificación': fecha(o.estimacion_calificacion as string | null),
      'Fecha adjudicación est.': fecha(o.fecha_adjudicacion_est as string | null),
      'Inicio despachos est.': fecha(o.fecha_inicio_despachos_est as string | null),
      'Fecha cierre est.': fecha(o.fecha_cierre_est as string | null),
      'Fecha cierre real': fecha(o.fecha_cierre_real as string | null),
      'Motivo de pérdida': o.motivo_perdida,
      'Descripción': o.descripcion,
      'Notas internas': o.notas_internas,
      'Creada': fechaHora(o.created_at as string),
      'Última actualización': fechaHora(o.updated_at as string),
      'Días desde creación': dias(o.created_at as string, o.fecha_cierre_real as string | null),
    }
    HITOS_VIT_NOMBRES.forEach((nombre, i) => {
      const h = hitos?.[String(i + 1)]
      fila['Hito ' + (i + 1) + '. ' + nombre] = h
        ? (h.cumplida ? 'Cumplido' : 'Pendiente') + (h.descripcion ? ' — ' + h.descripcion : '')
        : ''
    })
    return fila
  }))

  hoja(libro, 'Tipologías', (tipologias.data ?? []).map((t) => ({
    'Código': cod(t.oportunidad_id),
    'Oportunidad': nom(t.oportunidad_id),
    'Tipología': t.tipologia,
    'Precio UF': t.precio_uf,
    'Cantidad de casas': t.cantidad_casas,
    'Total UF': (t.precio_uf ?? 0) * (t.cantidad_casas ?? 0),
  })))

  // La cubicacion de Costos y Presupuestos viaja como JSON dentro de datos_etapa: se abre
  // en su propia hoja item por item, y el resto de las claves va como clave/valor.
  const cubicacion: Fila[] = []
  const otrosDatos: Fila[] = []
  for (const d of datosEtapa.data ?? []) {
    const datos = (d.datos ?? {}) as Record<string, unknown>
    for (const [clave, valor] of Object.entries(datos)) {
      if (clave === 'cubicacion_items_json') {
        let items: Record<string, unknown>[] = []
        try { items = JSON.parse(String(valor)) } catch { items = [] }
        for (const it of items) {
          cubicacion.push({
            'Código': cod(d.oportunidad_id),
            'Oportunidad': nom(d.oportunidad_id),
            'Tipología': it.tipologia,
            'Categoría': it.categoria,
            'Ítem': it.nombre,
            'Cantidad': it.cantidad,
            'Costo unitario': it.costo_unitario,
            'Costo total': it.costo_total,
          })
        }
        continue
      }
      otrosDatos.push({
        'Código': cod(d.oportunidad_id),
        'Oportunidad': nom(d.oportunidad_id),
        'Etapa': d.etapa,
        'Dato': clave,
        'Valor': typeof valor === 'object' && valor !== null ? JSON.stringify(valor) : valor,
        'Actualizado por': usuario(d.updated_by),
        'Actualizado': fechaHora(d.updated_at),
      })
    }
  }
  hoja(libro, 'Cubicación', cubicacion)
  hoja(libro, 'Datos por etapa', otrosDatos)

  hoja(libro, 'Historial de etapas', (hist.data ?? []).map((h) => ({
    'Código': cod(h.oportunidad_id),
    'Oportunidad': nom(h.oportunidad_id),
    'Etapa': h.etapa,
    'Entrada': fechaHora(h.fecha_entrada),
    'Salida': fechaHora(h.fecha_salida),
    'Días en etapa': dias(h.fecha_entrada, h.fecha_salida),
    'Movida por': usuario(h.usuario_id),
    'Notas': h.notas,
  })))

  hoja(libro, 'Tareas', (tareas.data ?? []).map((t) => ({
    'Código': cod(t.oportunidad_id),
    'Oportunidad': nom(t.oportunidad_id),
    'Título': t.titulo,
    'Descripción': t.descripcion,
    'Estado': t.estado,
    'Prioridad': t.prioridad,
    'Fecha límite': fecha(t.fecha_limite),
    'Completada': fechaHora(t.completada_at),
    'Respondida por': usuario(t.respondido_por),
    'Respondida': fechaHora(t.respondido_at),
    'Motivo de rechazo': t.motivo_rechazo,
    'Documentos requeridos': lista(t.tipos_documento_requeridos),
    'Notas': t.notas,
    'Creada': fechaHora(t.created_at),
  })))

  hoja(libro, 'Responsables', (asigs.data ?? []).map((a) => ({
    'Código': cod(a.oportunidad_id),
    'Oportunidad': nom(a.oportunidad_id),
    'Etapa': a.etapa,
    'Responsable': usuario(a.usuario_id),
    'Asignado por': usuario(a.asignado_por),
    'Asignado': fechaHora(a.created_at),
  })))

  hoja(libro, 'Documentos', (docs.data ?? []).map((d) => ({
    'Código': cod(d.oportunidad_id),
    'Oportunidad': nom(d.oportunidad_id),
    'Etapa': d.etapa,
    'Nombre': d.nombre,
    'Tipo': d.tipo,
    'Extensión': d.extension,
    'Tamaño (KB)': d.tamanio_bytes ? Math.round(d.tamanio_bytes / 1024) : '',
    'Comentario': d.comentario,
    'Subido por': usuario(d.subido_por),
    'Subido': fechaHora(d.created_at),
    'URL': d.url,
  })))

  hoja(libro, 'Mensajes', (mensajes.data ?? []).map((m) => ({
    'Código': cod(m.oportunidad_id),
    'Oportunidad': nom(m.oportunidad_id),
    'Etapa': m.etapa,
    'Autor': usuario(m.usuario_id),
    'Mensaje': m.mensaje,
    'Fecha': fechaHora(m.created_at),
  })))

  XLSX.writeFile(libro, 'oportunidades_' + new Date().toISOString().slice(0, 10) + '.xlsx')
  return filas.length
}
