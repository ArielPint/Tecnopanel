import * as XLSX from 'xlsx'

const XLSURL = 'https://raw.githubusercontent.com/ArielPint/LA-CHACRA/main/data/ubicaciones.xlsx'

export interface ModuloCatalogo {
  nroSerie: string
  torre: string
  tipo: string
}

export interface CatalogoModulos {
  modulos: Record<string, ModuloCatalogo>
  torres: string[]
}

// Catálogo fijo módulo → {serie, torre, tipo}, igual fuente que compras.html original (XLSURL público en GitHub)
export async function loadCatalogoModulos(): Promise<CatalogoModulos> {
  const res = await fetch(XLSURL)
  const buf = await res.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets['BASE'] || wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]

  let hi = rows.findIndex((r) => r.some((c) => /M[ÓO]DULO|SERIE/i.test(String(c))))
  if (hi < 0) hi = 0
  const hdr = rows[hi].map((c) => String(c).trim().toUpperCase())
  const ci = (name: string) => hdr.findIndex((h) => h.includes(name))
  const iT = ci('TORRE')
  const iM = ci('MÓDULO')
  const iS = ci('SERIE')
  const iTp = ci('TIPO')

  const modulos: Record<string, ModuloCatalogo> = {}
  const torres = new Set<string>()
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]
    const m = String(r[iM] ?? '').trim()
    if (!m.startsWith('M-')) continue
    const torre = String(r[iT] ?? '').trim()
    modulos[m] = { nroSerie: String(r[iS] ?? '').trim(), torre, tipo: String(r[iTp] ?? '').trim() }
    if (torre) torres.add(torre)
  }

  const torresOrdenadas = [...torres].sort((a, b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0))
  return { modulos, torres: torresOrdenadas }
}
