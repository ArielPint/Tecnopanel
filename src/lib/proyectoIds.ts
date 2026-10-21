import { supabase } from './supabaseClient'

/** Pseudo-proyecto ancla de los accesos del portal Producción de Paneles SIP (slug 'produccion-sip',
 *  tipo 'sistema'). Id fijo, creado por la migración 20261006120000_produccion_sip.sql: no hace falta
 *  consultarlo, y así el hub no se cae en una base que todavía no tiene el portal. */
export const SIP_ANCLA_ID = '043e6b57-8c97-4eef-8bf2-53d117afc5df'

/** Pseudo-proyecto ancla de los accesos del módulo SSO / Prevención (slug 'sso', tipo 'sistema').
 *  Id fijo, creado por la migración 20260930120000_sso_prevencion.sql: no hace falta consultarlo, y
 *  así el hub no se cae en una base que todavía no tiene el módulo. Es propio y no el de Gestión
 *  ('sistema'): syncPermisosGestion reemplaza todas las filas del usuario en ese ancla. */
export const SSO_ANCLA_ID = '9cb074b8-9085-4b96-9600-0b7fde3d036e'

/** Pseudo-proyecto ancla de los accesos del portal Ingreso de Personal (slug 'ingreso-personal', tipo
 *  'sistema'). Id fijo, creado por la migración 20261015120000_ingreso_personal.sql. */
export const ING_ANCLA_ID = '5d3f8a2e-7b41-4c69-a0d2-9e6b1f4c8a17'

/** Pseudo-proyecto ancla de los accesos de Control de Contratistas (slug 'control-contratistas', tipo
 *  'sistema'). Id fijo, creado por la migración 20261106120000_ingreso_personal_control_contratistas.sql. */
export const CTR_ANCLA_ID = 'c7a14e52-3b8d-4f61-9e2a-6d05b8f3c91e'

/** Pseudo-proyecto ancla de los accesos del portal Adquisiciones (slug 'adquisiciones', tipo
 *  'sistema'). Id fijo, creado por la migración 20261016120000_adquisiciones.sql. */
export const ADQ_ANCLA_ID = 'a7c4e1d2-3b5f-4e8a-9c61-2f0d8b4e7a35'

/** Pseudo-proyecto ancla de los accesos del portal Financiero (slug 'financiero', tipo 'sistema').
 *  Id fijo, creado por la migración 20261019120000_financiero_sap.sql. */
export const FIN_ANCLA_ID = '5e0b9c3a-6f21-4d7e-8a94-c1f3e2d7b680'

/** Pseudo-proyecto ancla de las preferencias de correo de las notificaciones (slug 'notificaciones', tipo
 *  'sistema'). Id fijo, creado por la migración 20261023120000_notificaciones_correo.sql. No da acceso a
 *  ningún portal: sus filas solo dicen qué avisos NO van por correo. */
export const NOTIF_ANCLA_ID = 'c3e9a6f1-2d84-4b7a-9e15-7f0b4d2a8c61'

const cache = new Map<string, Promise<string>>()

export function getProyectoId(slug: string): Promise<string> {
  if (!cache.has(slug)) {
    cache.set(
      slug,
      (async () => {
        try {
          // Reintenta una vez: si esta query es de las primeras que dispara la app tras
          // cargar la sesión desde localStorage, puede salir antes de que el token recién
          // refrescado quede attacheado al cliente (carrera real vista en prod, 401 espurio
          // en "proyectos" en el primer load). Un solo retry le da tiempo al refresh.
          let data, error
          for (let intento = 0; intento < 2; intento++) {
            ;({ data, error } = await supabase.from('proyectos').select('id').eq('slug', slug).single())
            if (!error && data) break
            if (intento === 0) await new Promise((r) => setTimeout(r, 500))
          }
          if (error || !data) throw new Error(`proyecto "${slug}" no encontrado`)
          return data.id as string
        } catch (err) {
          cache.delete(slug)
          throw err
        }
      })(),
    )
  }
  return cache.get(slug)!
}
