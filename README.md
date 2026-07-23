# Tecnopanel Hub

Dashboard empresarial central que consolida **La Chacra** (construcción modular) y **CRM
Tecnopanel** (ventas) sobre un único proyecto Supabase (`stddkmzdnfealqyzbwtz`).

Ver el plan completo de 4 fases en `PROMPT_TECNOPANEL_HUB.md` (carpeta raíz del proyecto) y el
alcance específico de esta fase en `hub-migration/FASE2_SCOPE.md`.

## Estado actual (Fase 2 — en progreso)

- [x] Layout base (sidebar + header), login con Supabase Auth, rutas protegidas.
- [x] Dashboard con tarjetas KPI + gráfico de barras por proyecto, leyendo `proyectos` y
      `project_kpis` reales del hub.
- [x] Página de Proyectos (acceso rápido a cada app).
- [ ] Página de Usuarios: placeholder, la gestión real de accesos llega en la Fase 4.
- [ ] `project_kpis` todavía no tiene datos reales — se puebla en la Fase 3 (Edge Functions de
      sincronización desde La Chacra/CRM). Mientras tanto el dashboard muestra un estado vacío
      explicativo por proyecto.

## Desarrollo local

```bash
npm install
cp .env.example .env   # ya viene precargado con la URL + anon key del hub
npm run dev
```

## Deploy (Vercel)

El proyecto se despliega en Vercel, importando el repo
[`ArielPint/Tecnopanel`](https://github.com/ArielPint/Tecnopanel) directamente desde su dashboard.
Cada `git push` a `main` dispara un deploy automático. Ver instrucciones paso a paso en
`VERCEL_DEPLOY.md`.

`vite.config.ts` sirve desde la raíz (`base: '/'`) y `src/App.tsx` no usa `basename`, porque
Vercel publica el sitio en la raíz de su propio dominio (no en un sub-path como GitHub Pages).

> Nota: el proyecto estuvo publicado antes en GitHub Pages (`gh-pages` branch); ese deploy quedó
> discontinuado al migrar a Vercel.
