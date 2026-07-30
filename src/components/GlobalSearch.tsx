import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Briefcase, Building2, Package, Truck, User, Users, Box } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'

interface Resultado {
  tipo: string
  id: string
  titulo: string
  subtitulo: string
  ruta: string
}

const ICONOS: Record<string, typeof Search> = {
  oportunidad: Briefcase,
  cliente: Building2,
  orden_compra: Package,
  proveedor: Truck,
  responsable: User,
  modulo: Box,
  usuario: Users,
}

const LABELS: Record<string, string> = {
  oportunidad: 'Oportunidad',
  cliente: 'Cliente',
  orden_compra: 'Orden de compra',
  proveedor: 'Proveedor',
  responsable: 'Responsable',
  modulo: 'Módulo de planta',
  usuario: 'Usuario',
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
    else { setQuery(''); setResultados([]); setActiveIndex(0) }
  }, [open])

  useEffect(() => {
    if (query.trim().length < 2) { setResultados([]); return }
    setLoading(true)
    const timeout = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_global', { q: query.trim() })
      if (!error) setResultados((data as Resultado[]) ?? [])
      setActiveIndex(0)
      setLoading(false)
    }, 250)
    return () => clearTimeout(timeout)
  }, [query])

  function ir(r: Resultado) {
    setOpen(false)
    navigate(r.ruta)
  }

  function onKeyDownInput(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, resultados.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && resultados[activeIndex]) ir(resultados[activeIndex])
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Búsqueda global"
      >
        <Search className="h-[15px] w-[15px]" />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold sm:inline">
          Ctrl K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDownInput}
                placeholder="Buscar oportunidades, clientes, OC, módulos, usuarios..."
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {loading && <p className="px-3 py-4 text-center text-xs text-muted-foreground">Buscando...</p>}

              {!loading && query.trim().length >= 2 && resultados.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">Sin resultados para "{query}"</p>
              )}

              {!loading && query.trim().length < 2 && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">Escribe al menos 2 caracteres...</p>
              )}

              {resultados.map((r, i) => {
                const Icono = ICONOS[r.tipo] ?? Search
                return (
                  <button
                    key={r.tipo + r.id}
                    onClick={() => ir(r)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                      i === activeIndex ? 'bg-brand/10' : 'hover:bg-accent'
                    )}
                  >
                    <Icono className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-foreground">{r.titulo}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{r.subtitulo}</p>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {LABELS[r.tipo] ?? r.tipo}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
