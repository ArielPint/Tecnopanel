export function weekKey(date: Date): number {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function weekLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' })
}

export function dateFromWeekKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}
