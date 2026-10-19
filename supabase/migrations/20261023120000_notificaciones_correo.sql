-- Correo de las notificaciones, por usuario: en Usuarios > pestaña Notificaciones se elige que avisos le
-- llegan tambien por correo. La campana del portal no cambia (sigue mostrando todo).
--
-- Se guarda en permisos sobre un pseudo-proyecto ancla propio (slug 'notificaciones', tipo 'sistema'),
-- como los demas portales, y solo lo DESACTIVADO (sin fila = recibe el correo, como hasta ahora):
--   modulo_key 'sin_correo:<origen>:<grupo>'  accion 'ver'   p. ej. 'sin_correo:crm:etapa_cambio'
-- Las claves <origen>:<grupo> son las de src/modules/usuarios/notificaciones.ts y las que calculan
-- stack\tareas\correos-notificaciones.ps1 (campana) y stack\tareas\correos-ingreso.ps1 (Ingreso de
-- Personal y Adquisiciones), que dejan como omitido lo que el usuario no quiere por correo.
-- Ancla propia y no 'sistema': cualquier fila en 'sistema' da acceso a Gestion (useAccesoUsuario).
--
-- Re-ejecutable.
set client_encoding = 'UTF8';

begin;

insert into public.proyectos (id, nombre, slug, tipo, estado, color_icon, descripcion)
values ('c3e9a6f1-2d84-4b7a-9e15-7f0b4d2a8c61', 'Notificaciones (sistema)', 'notificaciones', 'sistema', 'activo',
        '#64748b', 'Ancla de las preferencias de correo de las notificaciones. No es una obra.')
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

create or replace function public.notif_ancla_id()
returns uuid language sql immutable as $$
  select 'c3e9a6f1-2d84-4b7a-9e15-7f0b4d2a8c61'::uuid
$$;

commit;
