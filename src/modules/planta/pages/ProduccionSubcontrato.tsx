import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/modules/financiero/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/financiero/components/ui/select'
import { useModulosSubcontrato } from '../hooks/useModulosSubcontrato'

type Filtro = 'sin_asignar' | 'todos' | 'WEDO' | 'CONBES'

export default function ProduccionSubcontrato() {
  const { modulos, loading, guardar } = useModulosSubcontrato()
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('sin_asignar')
  const [torreFiltro, setTorreFiltro] = useState('todas')
  const [guardando, setGuardando] = useState<string | null>(null)

  const sinAsignarCount = useMemo(() => modulos.filter((m) => !m.subcontrato).length, [modulos])

  const torres = useMemo(
    () => Array.from(new Set(modulos.map((m) => m.torre).filter((t): t is string => !!t))).sort(),
    [modulos],
  )

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase()
    return modulos.filter((m) => {
      if (filtro === 'sin_asignar' && m.subcontrato) return false
      if ((filtro === 'WEDO' || filtro === 'CONBES') && m.subcontrato !== filtro) return false
      if (torreFiltro !== 'todas' && m.torre !== torreFiltro) return false
      if (q && !`${m.nombre} ${m.torre ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [modulos, busqueda, filtro, torreFiltro])

  async function onAsignar(nombre: string, subcontrato: 'WEDO' | 'CONBES') {
    setGuardando(nombre)
    try {
      await guardar(nombre, subcontrato)
      toast.success(`${nombre} asignado a ${subcontrato}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setGuardando(null)
    }
  }

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar módulo, torre..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="h-9 max-w-56" />
        <Select value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sin_asignar">Sin asignar</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="WEDO">We Do</SelectItem>
            <SelectItem value="CONBES">Conbes</SelectItem>
          </SelectContent>
        </Select>
        <Select value={torreFiltro} onValueChange={setTorreFiltro}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las torres</SelectItem>
            {torres.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {sinAsignarCount} módulo(s) activo(s) sin subcontrato asociado · {filtrados.length} mostrados
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="px-2 py-1.5 text-left">Módulo</th>
              <th className="px-2 py-1.5 text-left">Torre</th>
              <th className="px-2 py-1.5 text-left">Tipo</th>
              <th className="px-2 py-1.5 text-left">Subcontrato</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((m) => (
              <tr key={m.nombre} className="border-b last:border-0">
                <td className="px-2 py-1.5">{m.nombre}</td>
                <td className="px-2 py-1.5">{m.torre || '—'}</td>
                <td className="px-2 py-1.5">{m.tipo || '—'}</td>
                <td className="px-2 py-1.5">
                  <Select
                    value={m.subcontrato ?? '__sin_asignar'}
                    onValueChange={(v) => v !== '__sin_asignar' && onAsignar(m.nombre, v as 'WEDO' | 'CONBES')}
                    disabled={guardando === m.nombre}
                  >
                    <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__sin_asignar" disabled>Sin asignar</SelectItem>
                      <SelectItem value="WEDO">We Do</SelectItem>
                      <SelectItem value="CONBES">Conbes</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr><td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">Sin módulos para mostrar.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
