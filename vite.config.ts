import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel sirve el sitio desde la raíz del dominio, sin sub-path.
export default defineConfig({
  plugins: [react()],
  base: '/',
})
