// gv-proxy — Edge Function que integra la API de GeoVictoria server-side.
// Las credenciales (GV_APIKEY / GV_SECRET / GV_ENV / GV_CUSTOM_HOST) viven como
// secretos del proyecto, nunca se exponen al cliente. El cliente solo manda
// { action, params } y recibe la respuesta ya resuelta.
//
// Documentación API: https://wiki.geovictoria.com/wp-content/uploads/2020/11/Conjunto-de-Endpoints-GV3-unificado.pdf

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getEnv(name: string, fallback = ''): string {
  return Deno.env.get(name) ?? fallback
}

function baseUrl(subdomain: 'customerapi' | 'apiv3'): string {
  const customHost = getEnv('GV_CUSTOM_HOST')
  if (customHost) {
    return 'https://' + customHost.replace(/^https?:\/\//, '').replace(/^(customerapi|apiv3)\./, subdomain + '.')
  }
  const env = getEnv('GV_ENV', 'produccion')
  if (env === 'produccion' || !env) return `https://${subdomain}.geovictoria.com`
  return `https://${subdomain}.${env}.geovictoria.com`
}

async function gvFetch(url: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const text = await resp.text()
  if (!resp.ok) throw new Error(`GeoVictoria API error ${resp.status}: ${text.slice(0, 300)}`)
  try { return JSON.parse(text) } catch { return text }
}

let cachedToken: { token: string; ts: number } | null = null
const TOKEN_TTL = 4.5 * 60 * 60 * 1000

async function getToken(force = false): Promise<string> {
  const apiKey = getEnv('GV_APIKEY')
  const secret = getEnv('GV_SECRET')
  if (!apiKey || !secret) throw new Error('GeoVictoria: credenciales no configuradas en el servidor (GV_APIKEY/GV_SECRET).')

  const now = Date.now()
  if (!force && cachedToken && now - cachedToken.ts < TOKEN_TTL) return cachedToken.token

  const data = await gvFetch(`${baseUrl('customerapi')}/api/v1/Login`, { User: apiKey, Password: secret })
  const token = data.token || data.Token
  if (!token) throw new Error('GeoVictoria: Login no devolvió token.')
  cachedToken = { token, ts: now }
  return token
}

async function tokenHeaders(): Promise<Record<string, string>> {
  const token = await getToken()
  return { Authorization: `Bearer ${token}` }
}

async function apiv3Post(path: string, extra: Record<string, unknown> = {}) {
  const url = `${baseUrl('apiv3')}${path}`
  const apiKey = getEnv('GV_APIKEY')
  const secret = getEnv('GV_SECRET')
  const isAuthErr = (m: string) => m.includes('401') || m.includes('404') || m.includes('400')

  try {
    return await gvFetch(url, extra, await tokenHeaders())
  } catch (e) {
    if (!isAuthErr((e as Error).message || '')) throw e
  }
  try {
    return await gvFetch(url, { ApiKey: apiKey, Secret: secret, ...extra })
  } catch (e) {
    if (!isAuthErr((e as Error).message || '')) throw e
  }
  try {
    return await gvFetch(url, { User: apiKey, Password: secret, ...extra })
  } catch (e) {
    if (!isAuthErr((e as Error).message || '')) throw e
  }
  return gvFetch(url, { ApiKey: apiKey, ApiSecret: secret, ...extra })
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

type Params = Record<string, unknown>

async function runAction(action: string, params: Params) {
  switch (action) {
    case 'testConnection': {
      const token = await getToken(true)
      return { ok: true, token: token.slice(0, 20) + '...' }
    }
    case 'getWorkers':
      return apiv3Post('/api/User/List')
    case 'getGroups':
      return apiv3Post('/api/Group/ListGroup')
    case 'getShifts':
      return apiv3Post('/api/Shift/List')
    case 'getPositions':
      return apiv3Post('/api/Position/List')
    case 'getAttendanceBook': {
      const { userIds, startDate, endDate } = params as { userIds?: string[]; startDate: string; endDate: string }
      const body: Params = { StartDate: fmtDate(startDate), EndDate: fmtDate(endDate) }
      if (userIds && userIds.length > 0) body.UserIds = userIds.join(',')
      return gvFetch(`${baseUrl('customerapi')}/api/v1/AttendanceBook`, body, await tokenHeaders())
    }
    case 'resetPunchCheckpoint': {
      const { date } = params as { date?: string }
      const d = date ? new Date(date) : new Date(new Date().setHours(0, 0, 0, 0))
      return gvFetch(`${baseUrl('customerapi')}/api/v1/Punch/UpdateTimeOffCreationDateCheckpoint`, { CheckpointDate: fmtDate(d.toISOString()) }, await tokenHeaders())
    }
    case 'getRecentPunches': {
      const { resetCheckpoint } = params as { resetCheckpoint?: boolean }
      if (resetCheckpoint) await runAction('resetPunchCheckpoint', {})
      return gvFetch(`${baseUrl('customerapi')}/api/v1/Punch/ListPending`, {}, await tokenHeaders())
    }
    case 'getTimeOffs': {
      const { userIds, startDate, endDate } = params as { userIds?: string[]; startDate: string; endDate: string }
      const body: Params = { StartDate: fmtDate(startDate), EndDate: fmtDate(endDate) }
      if (userIds && userIds.length > 0) body.UserIds = userIds
      return gvFetch(`${baseUrl('customerapi')}/api/v1/TimeOff/Get`, body, await tokenHeaders())
    }
    case 'getActivities': {
      const { identifiers, from, to } = params as { identifiers: string[]; from: string; to: string }
      const fmtSlash = (iso: string) => {
        const d = new Date(iso)
        const p = (n: number) => String(n).padStart(2, '0')
        return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
      }
      return apiv3Post('/api/Activity/GetActivities', { Range: identifiers.join(','), from: fmtSlash(from), to: fmtSlash(to), includeAll: '0' })
    }
    case 'getRemunerationsConsolidated': {
      const { userIds, startDate, endDate, includeAll } = params as { userIds?: string[]; startDate: string; endDate: string; includeAll?: number }
      const body: Params = { IncludeAll: includeAll ?? 0, StartDate: fmtDate(startDate), EndDate: fmtDate(endDate) }
      if (userIds && userIds.length > 0) body.UserIds = userIds.join(',')
      return gvFetch(`${baseUrl('customerapi')}/api/v1/Consolidated`, body, await tokenHeaders())
    }
    default:
      throw new Error(`Acción desconocida: ${action}`)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'No autenticado.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { action, params } = await req.json()
    if (!action) throw new Error('Falta "action" en el body.')

    const result = await runAction(action, params ?? {})
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
