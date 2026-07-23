import { create } from 'zustand'

export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'tecnopanel-hub-theme'

function getInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  const mode: ThemeMode = window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  // Aplica la clase de inmediato (antes del primer render) para evitar el
  // parpadeo de tema al cargar la página.
  document.documentElement.classList.toggle('dark', mode === 'dark')
  return mode
}

interface ThemeState {
  mode: ThemeMode
  toggleMode: () => void
}

// Tema claro/oscuro de TODA la app (no solo el sidebar), igual que en La
// Chacra. Se persiste en localStorage y se aplica agregando/quitando la
// clase "dark" en <html>, que es lo que activa las variantes dark: de
// Tailwind en cualquier componente de la app.
export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: getInitialMode(),
  toggleMode: () => {
    const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark'
    window.localStorage.setItem(STORAGE_KEY, next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    set({ mode: next })
  },
}))
