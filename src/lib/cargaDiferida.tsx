import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react'

// Carga diferida de cada sección del portal: cada una queda en su propio archivo y se descarga
// recién al entrar a ella (las librerías pesadas van aparte, ver vite.config.ts).

const CLAVE_RECARGA = 'tp-recarga-version'

function marcaRecarga(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_RECARGA) === '1'
  } catch {
    return true // sin sessionStorage no hay cómo evitar un bucle: no se recarga
  }
}

function fijarMarca(valor: boolean) {
  try {
    if (valor) sessionStorage.setItem(CLAVE_RECARGA, '1')
    else sessionStorage.removeItem(CLAVE_RECARGA)
  } catch {
    // sin sessionStorage: nada que guardar
  }
}

// Una pestaña abierta antes de publicar una versión nueva puede pedir un archivo que ya no
// existe: se recarga la página una sola vez para tomar la versión nueva.
export function diferido<T extends ComponentType<object>>(cargar: () => Promise<{ default: T }>) {
  return lazy(() =>
    cargar().then(
      (modulo) => {
        fijarMarca(false)
        return modulo
      },
      (error: unknown) => {
        if (!marcaRecarga()) {
          fijarMarca(true)
          window.location.reload()
          return new Promise<never>(() => {})
        }
        throw error
      },
    ),
  )
}

// Si la sección no se pudo descargar (sin conexión, o el archivo sigue sin existir después de
// la recarga), se muestra un aviso en vez de dejar la página en blanco.
class ErrorDeCarga extends Component<{ children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false }

  static getDerivedStateFromError() {
    return { fallo: true }
  }

  render() {
    if (!this.state.fallo) return this.props.children
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center text-gray-600">
        <p>No se pudo cargar esta sección. Revisa tu conexión e inténtalo de nuevo.</p>
        <button
          type="button"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          onClick={() => {
            fijarMarca(false)
            window.location.reload()
          }}
        >
          Recargar
        </button>
      </div>
    )
  }
}

export function ConCarga({ children }: { children: ReactNode }) {
  return (
    <ErrorDeCarga>
      <Suspense
        fallback={<div className="flex min-h-[50vh] items-center justify-center text-gray-500">Cargando…</div>}
      >
        {children}
      </Suspense>
    </ErrorDeCarga>
  )
}
