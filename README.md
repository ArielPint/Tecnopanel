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

## Deploy (GitHub Pages)

```bash
npm run deploy
```

Publica el contenido de `dist/` en la rama `gh-pages`. El repo real es
[`ArielPint/Tecnopanel`](https://github.com/ArielPint/Tecnopanel), publicado en
`https://arielpint.github.io/Tecnopanel` — el `base` en `vite.config.ts` y el `basename` del
`BrowserRouter` en `src/App.tsx` ya están configurados como `/Tecnopanel/` para que coincida.
