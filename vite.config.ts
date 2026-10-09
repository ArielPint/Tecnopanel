import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel sirve el sitio desde la raíz del dominio, sin sub-path.
export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Librerías en archivos propios: no cambian entre versiones, así el navegador las
        // conserva y tras cada publicación solo se descarga lo que cambió. Se agrupa solo el
        // paquete exacto. Las librerías chicas que comparten el código inicial y los grupos
        // pesados van al grupo base: si no, Rollup las mete en 'graficos' o 'pdf' y el login
        // termina bajando esos archivos completos.
        manualChunks(id) {
          // ayudantes internos de Vite/Rollup (carga diferida, CommonJS): los usa todo el mundo
          if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'react'
          const m = id.match(/[\\/]node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/)
          if (!m) return undefined
          const pkg = m[1].replace('\\', '/')
          if (['react', 'react-dom', 'react-router', 'react-router-dom', 'scheduler'].includes(pkg)) return 'react'
          if (['clsx', 'use-sync-external-store', 'tslib'].includes(pkg) || pkg.startsWith('@babel/')) return 'react'
          // íconos: sueltos serían decenas de archivos diminutos (un pedido cada uno)
          if (pkg === 'lucide-react') return 'iconos'
          if (pkg.startsWith('@supabase/')) return 'supabase'
          if (pkg === 'recharts') return 'graficos'
          if (pkg === 'xlsx') return 'excel'
          if (pkg === 'jspdf') return 'pdf'
          return undefined
        },
      },
    },
  },
})
