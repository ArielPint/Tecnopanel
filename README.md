# Tecnopanel Hub

Dashboard empresarial central que consolida **La Chacra** (construcción modular) y **CRM
Tecnopanel** (ventas) sobre un único proyecto Supabase (`stddkmzdnfealqyzbwtz`).

Ver el plan completo de 4 fases en `PROMPT_TECNOPANEL_HUB.md` (carpeta raíz del proyecto) y el
alcance específico de esta fase en `hub-migration/FASE2_SCOPE.md`.

## Estado actual (corregido 2026-08-26 — muy por delante de "Fase 2")

Este README quedó desactualizado en la Fase 2 original (mediados de 2026-07). El estado real y
vivo del proyecto está en `PLAN_AVANCE_GENERAL.md` (raíz de `Proyecto Tecnopanel/`) — resumen:

- [x] Layout base (sidebar + header), login con Supabase Auth, rutas protegidas.
- [x] Dashboard con tarjetas KPI + gráfico de barras por proyecto, leyendo `proyectos` y
      `project_kpis` reales del hub — **KPIs de La Chacra en vivo desde 2026-08-07**
      (`useSyncProjectKpis.ts`), ya no es solo estado vacío.
- [x] Página de Proyectos (acceso rápido a cada app + wizard de creación de proyecto, Fase F).
- [x] Página de Usuarios: **CRUD completo** (`UsuariosPage.tsx`, Fase E5, 2026-07-31) — ya no es
      placeholder.
- [x] Sistema de identidad/permisos completo (Fases A-G): perfiles fusionados, permisos por
      proyecto/módulo/pestaña, routing dinámico multi-proyecto (`/proyectos/:proyectoSlug/*`).
- [x] Módulos de producto: Producción (planta), Logística, Financiero, Avance Obra (CR), Estados
      de Pago, Solicitudes, Gestión (Reportes/Calendarización/Documentos/Comunicaciones), CRM.
- [ ] Producción sigue sobre Excel/PDF (no migrada a Supabase) — único módulo grande pendiente,
      acotado a un futuro "Proyecto B".
- [ ] Gestión → Alertas — postergada a propósito (sin fuente real de alerta de obra todavía).

## Desarrollo local

```bash
npm install
cp .env.example .env   # ya viene precargado con la URL + anon key del hub
npm run dev
```

## Deploy (Vercel)

El proyecto se despliega en Vercel, importando el repo
[`ArielPint/Tecnopanel`](https://github.com/ArielPint/Tecnopanel) directamente desde su dashboard.
Publicado en **https://tecnopanel.vercel.app**. Cada `git push` a `main` dispara un deploy
automático de producción. Ver instrucciones paso a paso en `VERCEL_DEPLOY.md`.

`vite.config.ts` sirve desde la raíz (`base: '/'`) y `src/App.tsx` no usa `basename`, porque
Vercel publica el sitio en la raíz de su propio dominio (no en un sub-path como GitHub Pages).

> Nota: el proyecto estuvo publicado antes en GitHub Pages (`gh-pages` branch); ese deploy quedó
> discontinuado al migrar a Vercel.
