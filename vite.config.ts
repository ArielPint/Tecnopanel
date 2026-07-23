import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages sirve el sitio desde /Tecnopanel/ (nombre real del repo: https://github.com/ArielPint/Tecnopanel).
export default defineConfig({
  plugins: [react()],
  base: '/Tecnopanel/',
})
