import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, Users as UsersIcon } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/financiero/components/ui/card'

// Puerto de asistencia.html + geovictoria.js (standalone La Chacra) al hub.
// Toda llamada a la API de GeoVictoria pasa por el Edge Function gv-proxy,
// que guarda las credenciales como secreto de servidor (GV_APIKEY/GV_SECRET) —
// nunca viajan al navegador. Grupos permitidos igual que el original.
const ALLOWED_GROUPS = ['ICG', 'Ingelagos', 'PDuarte', 'Terra Sur', 'Wedo']

function inAllowedGroup(groupDesc?: string) {
  return ALLOWED_GROUPS.some((g) => g.toLowerCase() === (groupDesc || '').trim().toLowerCase())
}
function canonicalGroup(groupDesc?: string) {
  const d = (groupDesc || '').trim()
  return ALLOWED_GROUPS.find((g) => g.toLowerCase() === d.toLowerCase()) || d
}

async function gv<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('gv-proxy', { body: { action, params } })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data as T
}

function parseGVDate(s?: string): Date | null {
  if (!s) return null
  const str = String(s).trim()
  const d = new Date(str)
  if (!isNaN(d.getTime())) return d
  let m = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  m = str.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  return null
}

interface Punch { UserIdentifier: string; Name?: string; Date: string; Type: string; Origin?: string }
interface Worker {
  Name?: string; LastName?: string; Identifier?: string; Email?: string
  GroupDescription?: string; positionName?: string; Enabled?: number | string; ContractDate?: string
}
interface Grupo { Description?: string; Path?: string; CostCenter?: string; Supervisors?: { Name?: string }[] }
interface AttendanceDay { Date: string; WorkedHours?: string; Absent?: string; Holiday?: string; Worked?: string; Punches?: Punch[] }
interface AttendanceUser {
  Name?: string; LastName?: string; Identifier?: string; positionName?: string
  GroupDescription?: string; Group?: string; GroupName?: string
  PlannedInterval?: AttendanceDay[]
}

type TabKey = 'presencia' | 'asistencia' | 'resumen' | 'trabajadores' | 'grupos'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'presencia', label: 'En Predio Ahora' },
  { key: 'asistencia', label: 'Libro de Asistencia' },
  { key: 'resumen', label: 'Resumen' },
  { key: 'trabajadores', label: 'Trabajadores' },
  { key: 'grupos', label: 'Grupos / Cuadrillas' },
]

const isoToday = () => new Date().toISOString().slice(0, 10)
const isoWeekAgo = () => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)

export default function GeoVictoriaPage() {
  const [tab, setTab] = useState<TabKey>('presencia')
  const [connected, setConnected] = useState<boolean | null>(null)
  const [checkingConn, setCheckingConn] = useState(true)

  useEffect(() => {
    gv('testConnection').then(() => setConnected(true)).catch(() => setConnected(false)).finally(() => setCheckingConn(false))
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold">GeoVictoria</h1>
          <p className="text-sm text-muted-foreground">Asistencia y personal — vía API GeoVictoria.</p>
        </div>
        <span
          className={
            'rounded-full border px-3 py-1 text-xs font-bold ' +
            (checkingConn
              ? 'border-border text-muted-foreground'
              : connected
                ? 'border-success/40 bg-success/10 text-success'
                : 'border-destructive/40 bg-destructive/10 text-destructive')
          }
        >
          {checkingConn ? 'Verificando…' : connected ? 'GeoVictoria ✓ conectado' : 'GeoVictoria ✕ sin conexión'}
        </span>
      </div>

      {connected === false && !checkingConn && (
        <Card className="border-destructive/40">
          <CardContent className="pt-4 text-sm text-muted-foreground">
            No se pudo conectar con la API de GeoVictoria. Verifica que <code>GV_APIKEY</code> y{' '}
            <code>GV_SECRET</code> estén configurados como secretos del Edge Function <code>gv-proxy</code> en Supabase.
          </CardContent>
        </Card>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              'whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition-colors ' +
              (tab === t.key ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {connected && tab === 'presencia' && <TabPresencia />}
      {connected && tab === 'asistencia' && <TabAsistencia />}
      {connected && tab === 'resumen' && <TabResumen />}
      {connected && tab === 'trabajadores' && <TabTrabajadores />}
      {connected && tab === 'grupos' && <TabGrupos />}
    </div>
  )
}

// ─── EN PREDIO AHORA ────────────────────────────────────────────────────────
function TabPresencia() {
  const [punches, setPunches] = useState<Punch[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  async function load() {
    setLoading(true); setError('')
    try {
      const p = await gv<Punch[]>('getRecentPunches', { resetCheckpoint: true })
      setPunches(Array.isArray(p) ? p : [])
      const w = await gv<Worker[]>('getWorkers').catch(() => [])
      setWorkers(Array.isArray(w) ? w : [])
      setUpdatedAt(new Date())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const inside = useMemo(() => {
    const allowedIds = workers.length > 0 ? new Set(workers.filter((w) => inAllowedGroup(w.GroupDescription)).map((w) => w.Identifier).filter(Boolean)) : null
    const byWorker: Record<string, Punch> = {}
    punches.forEach((p) => {
      if (allowedIds && !allowedIds.has(p.UserIdentifier)) return
      const prev = byWorker[p.UserIdentifier]
      if (!prev || new Date(p.Date) > new Date(prev.Date)) byWorker[p.UserIdentifier] = p
    })
    return Object.values(byWorker).filter((p) => p.Type === 'Ingreso')
  }, [punches, workers])

  const filtered = inside.filter((p) => {
    const q = query.toLowerCase()
    return !q || (p.UserIdentifier || '').toLowerCase().includes(q) || (p.Name || '').toLowerCase().includes(q)
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="En el predio" value={inside.length} tone="success" />
        <Kpi label="Registraron salida" value={punches.length - inside.length} tone="destructive" />
        <Kpi label="Total marcajes hoy" value={punches.length} tone="info" />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>Personas actualmente en el predio</CardTitle>
          <div className="flex items-center gap-2">
            {updatedAt && <span className="text-xs text-muted-foreground">Actualizado: {updatedAt.toLocaleTimeString('es-CL')}</span>}
            <button onClick={load} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Actualizar">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o RUT…"
              className="w-full max-w-sm rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand" />
          </div>
          {loading ? <p className="text-sm text-muted-foreground">Cargando…</p>
            : error ? <ErrorBox msg={error} />
            : filtered.length === 0 ? <EmptyBox msg="Sin marcajes de ingreso recientes." />
            : (
              <Tabla headers={['Nombre', 'RUT / ID', 'Hora ingreso', 'Origen']}>
                {filtered.map((p) => {
                  const d = parseGVDate(p.Date)
                  return (
                    <tr key={p.UserIdentifier} className="border-b border-border last:border-0 hover:bg-accent">
                      <td className="px-2 py-2"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-success" />{p.Name || '–'}</td>
                      <td className="px-2 py-2 text-muted-foreground">{p.UserIdentifier || '–'}</td>
                      <td className="px-2 py-2">{d ? d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '–'}</td>
                      <td className="px-2 py-2 text-muted-foreground">{p.Origin || '–'}</td>
                    </tr>
                  )
                })}
              </Tabla>
            )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── LIBRO DE ASISTENCIA ────────────────────────────────────────────────────
function TabAsistencia() {
  const [group, setGroup] = useState('')
  const [from, setFrom] = useState(isoWeekAgo())
  const [to, setTo] = useState(isoToday())
  const [users, setUsers] = useState<AttendanceUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [queried, setQueried] = useState(false)

  async function consultar() {
    setLoading(true); setError(''); setQueried(true)
    try {
      const startDate = new Date(from + 'T00:00:00').toISOString()
      const endDate = new Date(to + 'T23:59:59').toISOString()
      const data = await gv<{ Users?: AttendanceUser[] }>('getAttendanceBook', { startDate, endDate })
      let list = Array.isArray(data?.Users) ? data.Users : []
      if (group) {
        const filtered = list.filter((u) => canonicalGroup(u.GroupDescription || u.Group || u.GroupName) === group)
        if (filtered.length > 0) list = filtered
      }
      setUsers(list)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const fmtHora = (p?: Punch) => {
    const d = p ? parseGVDate(p.Date) : null
    return d ? d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '–'
  }

  const rows = users.flatMap((u) =>
    (u.PlannedInterval || []).map((day) => ({ user: u, day }))
  )

  return (
    <Card>
      <CardHeader><CardTitle>Libro de Asistencia por rango de fechas</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground">
            <option value="">Todos los grupos</option>
            {ALLOWED_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
          <button onClick={consultar} className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">Consultar</button>
        </div>

        {loading ? <p className="text-sm text-muted-foreground">Cargando…</p>
          : error ? <ErrorBox msg={error} />
          : !queried ? <EmptyBox msg="Elige un grupo (opcional) y un rango de fechas, luego consulta." />
          : rows.length === 0 ? <EmptyBox msg="Sin datos para el rango seleccionado." />
          : (
            <Tabla headers={['Nombre', 'RUT / ID', 'Cargo', 'Fecha', 'Estado', 'Entrada', 'Salida', 'Hrs.']}>
              {rows.map(({ user, day }, i) => {
                const entrada = day.Punches?.find((p) => p.Type === 'Ingreso')
                const salida = day.Punches?.find((p) => p.Type === 'Salida')
                const fecha = parseGVDate(day.Date)
                const ausente = day.Absent === 'True'
                const vacacion = day.Holiday === 'True'
                return (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-accent">
                    <td className="px-2 py-2 font-medium">{user.Name} {user.LastName}</td>
                    <td className="px-2 py-2 text-muted-foreground">{user.Identifier || '–'}</td>
                    <td className="px-2 py-2 text-muted-foreground">{user.positionName || '–'}</td>
                    <td className="px-2 py-2">{fecha ? fecha.toLocaleDateString('es-CL') : day.Date}</td>
                    <td className="px-2 py-2">
                      {ausente ? <Badge tone="destructive">Ausente</Badge> : vacacion ? <Badge tone="warning">Vacaciones</Badge> : day.Worked === 'True' ? <Badge tone="success">Trabajó</Badge> : <Badge tone="muted">–</Badge>}
                    </td>
                    <td className="px-2 py-2">{fmtHora(entrada)}</td>
                    <td className="px-2 py-2">{fmtHora(salida)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{parseFloat(day.WorkedHours || '0').toFixed(1)}h</td>
                  </tr>
                )
              })}
            </Tabla>
          )}
      </CardContent>
    </Card>
  )
}

// ─── RESUMEN ────────────────────────────────────────────────────────────────
function TabResumen() {
  const [group, setGroup] = useState('')
  const [from, setFrom] = useState(isoWeekAgo())
  const [to, setTo] = useState(isoToday())
  const [users, setUsers] = useState<AttendanceUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [queried, setQueried] = useState(false)

  async function consultar() {
    setLoading(true); setError(''); setQueried(true)
    try {
      const startDate = new Date(from + 'T00:00:00').toISOString()
      const endDate = new Date(to + 'T23:59:59').toISOString()
      const data = await gv<{ Users?: AttendanceUser[] }>('getAttendanceBook', { startDate, endDate })
      setUsers(Array.isArray(data?.Users) ? data.Users : [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const chartData = useMemo(() => {
    if (users.length === 0) return []
    const getGroup = (u: AttendanceUser) => canonicalGroup(u.GroupDescription || u.Group || u.GroupName)
    const filtered = group ? users.filter((u) => getGroup(u) === group) : users.filter((u) => inAllowedGroup(getGroup(u)))

    const rangeStart = new Date(from + 'T00:00:00')
    const rangeEnd = new Date(to + 'T00:00:00')
    const dayMap: Record<string, { fecha: string; asistentes: number; ausentes: number }> = {}
    for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10)
      dayMap[key] = { fecha: new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }), asistentes: 0, ausentes: 0 }
    }
    filtered.forEach((u) => {
      (u.PlannedInterval || []).forEach((day) => {
        const d = parseGVDate(day.Date)
        if (!d) return
        const key = d.toISOString().slice(0, 10)
        if (!dayMap[key]) return
        if (day.Worked === 'True') dayMap[key].asistentes++
        if (day.Absent === 'True') dayMap[key].ausentes++
      })
    })
    return Object.keys(dayMap).sort().map((k) => dayMap[k])
  }, [users, group, from, to])

  const totalWorkers = group ? users.filter((u) => canonicalGroup(u.GroupDescription || u.Group || u.GroupName) === group).length : users.length

  return (
    <Card>
      <CardHeader><CardTitle>Resumen de asistencia por día</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground">
            <option value="">Todos los grupos</option>
            {ALLOWED_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
          <button onClick={consultar} className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">Consultar</button>
        </div>

        {loading ? <p className="text-sm text-muted-foreground">Cargando…</p>
          : error ? <ErrorBox msg={error} />
          : !queried ? <EmptyBox msg="Elige el grupo y las fechas para ver el gráfico de asistencia diaria." />
          : chartData.length === 0 ? <EmptyBox msg="Sin datos de asistencia para el rango seleccionado." />
          : (
            <>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid vertical={false} strokeOpacity={0.3} />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="asistentes" name="Asistentes" fill="hsl(var(--success))" radius={4} />
                    <Bar dataKey="ausentes" name="Ausentes" fill="hsl(var(--destructive))" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Tabla headers={['Fecha', 'Asistentes', 'Ausentes', 'Total trabajadores', '% Asistencia']}>
                {chartData.map((row, i) => {
                  const pct = totalWorkers > 0 ? (row.asistentes / totalWorkers) * 100 : 0
                  return (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-accent">
                      <td className="px-2 py-2">{row.fecha}</td>
                      <td className="px-2 py-2 text-right font-semibold text-success tabular-nums">{row.asistentes}</td>
                      <td className="px-2 py-2 text-right text-destructive tabular-nums">{row.ausentes}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{totalWorkers}</td>
                      <td className="px-2 py-2 text-right font-bold tabular-nums">{pct.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </Tabla>
            </>
          )}
      </CardContent>
    </Card>
  )
}

// ─── TRABAJADORES ───────────────────────────────────────────────────────────
function TabTrabajadores() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const data = await gv<Worker[]>('getWorkers')
      setWorkers(Array.isArray(data) ? data : [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = workers.filter((w) => {
    if (!inAllowedGroup(w.GroupDescription)) return false
    const q = query.toLowerCase()
    const matchQ = !q || (w.Name || '').toLowerCase().includes(q) || (w.LastName || '').toLowerCase().includes(q) ||
      (w.Identifier || '').toLowerCase().includes(q) || (w.GroupDescription || '').toLowerCase().includes(q)
    const matchSt = !status || String(w.Enabled) === status
    return matchQ && matchSt
  })

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Nómina de trabajadores GeoVictoria</CardTitle>
        <button onClick={load} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Recargar">
          <RefreshCw className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, RUT o grupo…"
            className="w-full max-w-sm rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground">
            <option value="">Todos</option>
            <option value="1">Activos</option>
            <option value="0">Inactivos</option>
          </select>
        </div>

        {loading ? <p className="text-sm text-muted-foreground">Cargando…</p>
          : error ? <ErrorBox msg={error} />
          : filtered.length === 0 ? <EmptyBox msg="Sin resultados con ese filtro." />
          : (
            <>
              <p className="text-xs text-muted-foreground">{filtered.length} trabajadores</p>
              <Tabla headers={['Nombre', 'RUT / ID', 'Email', 'Grupo', 'Cargo', 'Estado']}>
                {filtered.map((w, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-accent">
                    <td className="px-2 py-2 font-medium">{w.Name} {w.LastName}</td>
                    <td className="px-2 py-2 text-muted-foreground">{w.Identifier || '–'}</td>
                    <td className="px-2 py-2 text-muted-foreground">{w.Email || '–'}</td>
                    <td className="px-2 py-2">{w.GroupDescription || '–'}</td>
                    <td className="px-2 py-2 text-muted-foreground">{w.positionName || '–'}</td>
                    <td className="px-2 py-2">{Number(w.Enabled) === 1 ? <Badge tone="success">Activo</Badge> : <Badge tone="muted">Inactivo</Badge>}</td>
                  </tr>
                ))}
              </Tabla>
            </>
          )}
      </CardContent>
    </Card>
  )
}

// ─── GRUPOS ─────────────────────────────────────────────────────────────────
function TabGrupos() {
  const [groups, setGroups] = useState<Grupo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const data = await gv<Grupo[] | { Groups?: Grupo[] }>('getGroups')
      setGroups(Array.isArray(data) ? data : (data?.Groups ?? []))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const visibles = groups.filter((g) => inAllowedGroup(g.Description))

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Grupos y cuadrillas</CardTitle>
        <button onClick={load} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Recargar">
          <RefreshCw className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-muted-foreground">Cargando…</p>
          : error ? <ErrorBox msg={error} />
          : visibles.length === 0 ? <EmptyBox msg="Sin grupos disponibles." />
          : (
            <Tabla headers={['Nombre', 'Ruta', 'Centro de costos', 'Supervisores']}>
              {visibles.map((g, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-accent">
                  <td className="px-2 py-2 font-medium">{g.Description || '–'}</td>
                  <td className="px-2 py-2 text-muted-foreground">{g.Path || '–'}</td>
                  <td className="px-2 py-2 text-muted-foreground">{g.CostCenter || '–'}</td>
                  <td className="px-2 py-2 text-muted-foreground">{(g.Supervisors || []).map((s) => s.Name).join(', ') || '–'}</td>
                </tr>
              ))}
            </Tabla>
          )}
      </CardContent>
    </Card>
  )
}

// ─── HELPERS DE UI ──────────────────────────────────────────────────────────
function Kpi({ label, value, tone }: { label: string; value: number; tone: 'success' | 'destructive' | 'info' }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'destructive' ? 'text-destructive' : 'text-info'
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={'text-2xl font-extrabold ' + toneClass}>{value}</p>
      </CardContent>
    </Card>
  )
}

function Tabla({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {headers.map((h) => <th key={h} className="px-2 py-2">{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Badge({ tone, children }: { tone: 'success' | 'destructive' | 'warning' | 'muted'; children: React.ReactNode }) {
  const cls = {
    success: 'bg-success/10 text-success',
    destructive: 'bg-destructive/10 text-destructive',
    warning: 'bg-warning/10 text-warning',
    muted: 'bg-muted text-muted-foreground',
  }[tone]
  return <span className={'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ' + cls}>{children}</span>
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <p className="font-semibold text-destructive">Error al conectar con GeoVictoria</p>
      <p className="mt-1 text-muted-foreground">{msg}</p>
    </div>
  )
}

function EmptyBox({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
      <UsersIcon className="h-6 w-6 text-muted-foreground" />
      <p className="max-w-sm text-sm text-muted-foreground">{msg}</p>
    </div>
  )
}
