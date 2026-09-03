import { useState, useEffect, useRef } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { fmtMontoCLP } from '@/lib/montoCLP'
import { handleSupabaseError } from '@/modules/crm/lib/errors'

interface Result {
  id: string
  nombre: string
  codigo: string
  etapa_actual: string
  monto_estimado: number | null
  cliente: { razon_social: string } | { razon_social: string }[] | null
}

const ETAPA_DOT: Record<string, string> = {
  'Clasificación': '#64748b',
  'Ingeniería': '#3b82f6',
  'Desarrollo': '#8b5cf6',
  'Costos y Presupuestos': '#f97316',
  'Ventas': '#f59e0b',
  'Negociación': '#ef4444',
}

function fmtM(n: number | null) {
  if (!n) return null
  return fmtMontoCLP(n)
}

export default function HeaderSearch() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(async () => {
      const trimmed = q.trim()
      if (trimmed.length < 2) { setResults([]); setOpen(false); return }
      setLoading(true)
      const { data, error } = await supabase
        .from('oportunidades')
        .select('id,nombre,codigo,etapa_actual,monto_estimado,cliente:clientes(razon_social)')
        .or(`nombre.ilike.%${trimmed}%,codigo.ilike.%${trimmed}%`)
        .limit(7)
      handleSupabaseError(error, 'HeaderSearch.search')
      setResults((data as unknown as Result[]) ?? [])
      setOpen(true)
      setLoading(false)
    }, 280)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  return (
    <div ref={ref} className="relative min-w-0 flex-1 sm:flex-none">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Buscar oportunidad..."
          className="w-full sm:w-64 pl-8 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-crm-red focus:bg-white transition-all"
        />
        {loading && (
          <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute left-0 top-11 w-[min(24rem,90vw)] bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          <p className="text-[10px] text-gray-400 px-4 pt-2.5 pb-1 font-medium uppercase tracking-wide">
            {results.length} resultado{results.length !== 1 ? 's' : ''}
          </p>
          <div className="divide-y divide-gray-50 pb-1">
            {results.map(r => (
              <div key={r.id} onClick={() => { setQ(''); setOpen(false) }}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
                <div className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
                  style={{ background: ETAPA_DOT[r.etapa_actual] ?? '#64748b' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{r.nombre}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-mono text-gray-400">{r.codigo}</span>
                    {r.cliente && (() => { const c = Array.isArray(r.cliente) ? r.cliente[0] : r.cliente; return c ? <span className="text-[10px] text-gray-400 truncate">· {c.razon_social}</span> : null })()}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 space-y-0.5">
                  <p className="text-[10px] text-gray-500">{r.etapa_actual}</p>
                  {r.monto_estimado && (
                    <p className="text-xs font-semibold text-gray-700">{fmtM(r.monto_estimado)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
