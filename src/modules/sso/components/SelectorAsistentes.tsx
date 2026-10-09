import { useMemo, useState } from 'react'
import { Search, UserX, X } from 'lucide-react'
import { Input } from '@/modules/financiero/components/ui/input'
import { Button } from '@/modules/financiero/components/ui/button'
import { cn } from '@/lib/utils'
import { formatearRut } from '../lib/rut'
import type { Area } from '../lib/tipos'
import type { Empresa, TrabajadorV } from '../lib/tiposTrabajadores'

export interface Seleccion {
  trabajador_id: string
  asistio: boolean
}

interface Props {
  trabajadores: TrabajadorV[]
  empresas: Empresa[]
  areas: Area[]
  seleccion: Seleccion[]
  onChange: (s: Seleccion[]) => void
}

const selectClase =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

/** Elige los asistentes de una capacitación entre los trabajadores activos (propios y contratistas).
 *  Un citado que no llegó queda como "ausente": así se ve quién faltó, y no cuenta para su vigencia. */
export function SelectorAsistentes({ trabajadores, empresas, areas, seleccion, onChange }: Props) {
  const [texto, setTexto] = useState('')
  const [empresaId, setEmpresaId] = useState('')
  const [areaId, setAreaId] = useState('')

  const elegidos = useMemo(() => new Map(seleccion.map((s) => [s.trabajador_id, s])), [seleccion])
  const porId = useMemo(() => new Map(trabajadores.map((t) => [t.id, t])), [trabajadores])

  const candidatos = useMemo(() => {
    const q = texto.trim().toLowerCase()
    const qRut = texto.replace(/[^0-9kK]/g, '')
    return trabajadores.filter((t) => {
      if (!t.activo || elegidos.has(t.id)) return false
      if (empresaId && t.empresa_id !== empresaId) return false
      if (areaId && t.area_id !== areaId) return false
      if (!q) return true
      return `${t.nombres} ${t.apellidos} ${t.cargo ?? ''}`.toLowerCase().includes(q) || (qRut.length >= 3 && t.rut.replace('-', '').includes(qRut))
    })
  }, [trabajadores, elegidos, texto, empresaId, areaId])

  const hayFiltro = texto.trim() !== '' || empresaId !== '' || areaId !== ''
  const agregar = (ids: string[]) => onChange([...seleccion, ...ids.map((id) => ({ trabajador_id: id, asistio: true }))])
  const quitar = (id: string) => onChange(seleccion.filter((s) => s.trabajador_id !== id))
  const alternar = (id: string) => onChange(seleccion.map((s) => (s.trabajador_id === id ? { ...s, asistio: !s.asistio } : s)))

  const presentes = seleccion.filter((s) => s.asistio).length

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="space-y-2 rounded-md border p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agregar</p>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Nombre, RUT o cargo" value={texto} onChange={(e) => setTexto(e.target.value)} className="pl-8" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className={selectClase} aria-label="Empresa">
            <option value="">Todas las empresas</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={selectClase} aria-label="Área">
            <option value="">Todas las áreas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </div>
        {hayFiltro && candidatos.length > 1 && (
          <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => agregar(candidatos.map((t) => t.id))}>
            Agregar los {candidatos.length} que coinciden
          </Button>
        )}
        <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
          {candidatos.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">{trabajadores.length === 0 ? 'No hay trabajadores registrados.' : 'Nadie más coincide.'}</li>
          ) : (
            candidatos.slice(0, 100).map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => agregar([t.id])} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent">
                  <span className="min-w-0 flex-1 truncate">
                    {t.apellidos}, {t.nombres}
                    <span className="ml-1 text-xs text-muted-foreground">· {t.cargo ?? 'sin cargo'} · {t.empresa}</span>
                  </span>
                  <span className="text-xs text-primary">Agregar</span>
                </button>
              </li>
            ))
          )}
        </ul>
        {candidatos.length > 100 && <p className="text-xs text-muted-foreground">Mostrando 100 de {candidatos.length}: filtra para ver el resto.</p>}
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Asistentes: {presentes}
            {seleccion.length > presentes && ` · ${seleccion.length - presentes} ausentes`}
          </p>
          {seleccion.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="text-xs text-muted-foreground hover:text-destructive">
              Quitar todos
            </button>
          )}
        </div>
        <ul className="max-h-[22rem] divide-y overflow-y-auto rounded-md border">
          {seleccion.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">Agrega a los trabajadores que participaron.</li>
          ) : (
            seleccion.map((s) => {
              const t = porId.get(s.trabajador_id)
              return (
                <li key={s.trabajador_id} className={cn('flex items-center gap-2 px-3 py-1.5 text-sm', !s.asistio && 'opacity-60')}>
                  <span className="min-w-0 flex-1 truncate">
                    {t ? `${t.apellidos}, ${t.nombres}` : 'Trabajador'}
                    <span className="ml-1 text-xs text-muted-foreground">{t ? formatearRut(t.rut) : ''}</span>
                    {!s.asistio && <span className="ml-2 rounded-full bg-muted px-1.5 text-[10px] font-semibold">ausente</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => alternar(s.trabajador_id)}
                    title={s.asistio ? 'Marcar como ausente' : 'Marcar como presente'}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <UserX className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => quitar(s.trabajador_id)} title="Quitar" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>
  )
}
