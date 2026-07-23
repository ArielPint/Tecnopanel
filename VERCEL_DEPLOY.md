# Publicar Tecnopanel Hub en Vercel

## 1. Importar el repo
1. Entrá a [vercel.com/new](https://vercel.com/new) y logueate con tu cuenta de GitHub
   (`ArielPint`) si no lo hiciste antes — Vercel pide autorización OAuth para leer tus repos.
2. Elegí el repo **`ArielPint/Tecnopanel`** y hacé clic en "Import".
3. Framework preset: Vercel detecta **Vite** automáticamente. Si no, elegilo manualmente.
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install` (default)

## 2. Variables de entorno
Antes de darle a "Deploy", agregá las mismas variables que tenés en tu `.env` local
(Project Settings → Environment Variables, o en el paso de import):

```
VITE_SUPABASE_URL=https://stddkmzdnfealqyzbwtz.supabase.co
VITE_SUPABASE_ANON_KEY=<la anon key pública del hub>
```

Son las que ya están en `.env.example`. Como Vite las incrusta en el build en tiempo de
compilación, tienen que estar configuradas en Vercel *antes* del primer deploy (o volver a
buildear después de agregarlas).

## 3. Deploy
Hacé clic en "Deploy". Vercel corre `npm install && npm run build` y publica `dist/` en un
dominio tipo `tecnopanel-xxxx.vercel.app`. Podés renombrar el proyecto en Settings → General
para conseguir un dominio más corto (ej. `tecnopanel-hub.vercel.app`, si está libre).

## 4. Deploys automáticos
Con el repo importado, cada `git push` a `main` dispara un deploy de producción automático, y
cada push a otra rama o PR genera un preview deployment con su propia URL. No hace falta correr
ningún comando manual (a diferencia de `npm run deploy` que usábamos con GitHub Pages).

## 5. Dominio propio (opcional)
Si más adelante querés un dominio propio (ej. `hub.tecnopanel.cl`), se configura en Project
Settings → Domains, agregando un registro CNAME en tu proveedor de DNS.

## Notas
- La anon key de Supabase es pública por diseño (protegida por RLS en el backend) — no hay
  problema de seguridad en que quede en el bundle JS, es el mismo patrón que ya usan La Chacra,
  el CRM, y el deploy anterior en GitHub Pages.
- El deploy anterior en GitHub Pages (rama `gh-pages`, `npm run deploy`) queda discontinuado:
  `vite.config.ts` y `src/App.tsx` ya no tienen el `base`/`basename` de `/Tecnopanel/` que
  necesitaba GitHub Pages, así que ese deploy quedaría roto si se reactivara sin revertir esos
  cambios.
