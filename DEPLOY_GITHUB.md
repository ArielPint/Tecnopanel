# Publicar Tecnopanel Hub en GitHub Pages

> **⚠️ Obsoleto (nota agregada 2026-08-26).** El deploy real hoy es **Vercel**
> (`tecnopanel.vercel.app`, ver `VERCEL_DEPLOY.md`), migrado desde GitHub Pages el 2026-07-23.
> `vite.config.ts`/`src/App.tsx` ya no tienen el `base`/`basename` de `/Tecnopanel/` que este
> flujo necesita — seguir estos pasos tal cual dejaría el deploy roto. Se deja el documento como
> referencia histórica, no como instrucción vigente.

## 0. Limpieza previa (una sola vez)
Intenté inicializar el repo git desde el sandbox y quedó una carpeta `.git` corrupta/vacía
(por una limitación de permisos al escribir sobre esta carpeta montada). Antes de seguir,
borrala manualmente:

```powershell
cd "C:\Proyecto Tecnopanel\tecnopanel-hub"
Remove-Item -Recurse -Force .git
```

## 1. Instalar dependencias y verificar el build
```powershell
cd "C:\Proyecto Tecnopanel\tecnopanel-hub"
npm install
npm run build
```
Debería compilar sin errores (0 errores TypeScript, build de Vite generado en `dist/`).

## 2. Crear el repo en GitHub
Ya decidido: **`ArielPint/Tecnopanel`** (público). `vite.config.ts`, `package.json` (`homepage`)
y `src/App.tsx` (`basename`) ya están ajustados a este nombre real — no hace falta tocar nada más.

No inicialices el repo con README/gitignore/license desde GitHub (ya los tenemos localmente).

## 3. Inicializar git localmente y hacer el primer commit
```powershell
cd "C:\Proyecto Tecnopanel\tecnopanel-hub"
git init
git add .
git commit -m "Initial commit: Tecnopanel Hub scaffold (Fase 2 - Dashboard Central)"
git branch -M main
git remote add origin https://github.com/ArielPint/Tecnopanel.git
git push -u origin main
```

## 4. Deploy a GitHub Pages
El repo ya tiene `gh-pages` como dependencia y los scripts configurados:
```powershell
npm run deploy
```
Esto corre `npm run build` (via `predeploy`) y publica el contenido de `dist/` a la rama
`gh-pages` del repo, usando el paquete `gh-pages`.

## 5. Activar GitHub Pages en la config del repo
En GitHub → Settings → Pages → Source: elegí la rama `gh-pages` (carpeta `/ (root)`).
Guardá. El sitio queda disponible en la URL de `homepage` (paso 3) en unos minutos.

## 6. Variables de entorno
El archivo `.env` (con la URL y anon key reales del hub) NO se sube a git (está en
`.gitignore`) — como es una app estática servida desde GitHub Pages, Vite incrusta esos
valores en el build en el momento de `npm run build`, así que no hace falta configurar
nada especial en GitHub para que funcione (a diferencia de un backend con secretos server-side).
Si alguna vez cloná el repo en otra máquina, copiá `.env.example` a `.env` y completá los
valores reales antes de buildear.

## Notas
- La anon key de Supabase es pública por diseño (protegida por RLS en el backend) — no hay
  problema de seguridad en que quede en el bundle JS público, es el mismo patrón que ya usan
  La Chacra y CRM.
- Cada vez que quieras publicar cambios nuevos: `git add . && git commit -m "..." && git push`,
  y luego `npm run deploy` de nuevo para actualizar GitHub Pages.
