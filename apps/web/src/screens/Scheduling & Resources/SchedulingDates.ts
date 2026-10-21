export function tenantLocalDate(timeZone: string | undefined, instant: Date = new Date()): string | null {
  if (!timeZone?.trim() || !Number.isFinite(instant.getTime())) return null
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant)
    const value = (type: string) => parts.find((part) => part.type === type)?.value
    const year = value('year')
    const month = value('month')
    const day = value('day')
    return year && month && day ? `${year}-${month}-${day}` : null
  } catch (error) {
    if (error instanceof RangeError) return null
    throw error
  }
}
export function timezoneLabel(timeZone: string | undefined) { return tenantLocalDate(timeZone) ? timeZone : 'Múi giờ tenant chưa xác định' }
export function formatInstant(iso: string, timeZone: string | undefined) {
  const instant = new Date(iso)
  if (!tenantLocalDate(timeZone, instant)) return iso
  return new Intl.DateTimeFormat('vi-VN', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(instant)
}
export function dayDate(iso: string) { return new Date(`${iso}T00:00:00Z`) }
export function isoDate(date: Date) { return date.toISOString().slice(0, 10) }
export function addDays(iso: string, count: number) { const date = dayDate(iso); date.setUTCDate(date.getUTCDate() + count); return isoDate(date) }
export function startOfWeek(iso: string) { const date = dayDate(iso); return addDays(iso, -((date.getUTCDay() + 6) % 7)) }
export function formatDate(iso: string) { const [year, month, day] = iso.split('-'); return `${day}/${month}/${year}` }
export function shortDate(iso: string) { return formatDate(iso).slice(0, 5) }
export function periodLabel(iso: string, mode: 'day' | 'week' | 'month') {
  if (mode === 'day') return formatDate(iso)
  if (mode === 'month') return `Tháng ${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}`
  const monday = startOfWeek(iso)
  return `${shortDate(monday)}–${shortDate(addDays(monday, 6))}`
}
export function shiftPeriod(iso: string, mode: 'day' | 'week' | 'month', direction: number) {
  if (mode === 'day') return addDays(iso, direction)
  if (mode === 'week') return addDays(iso, direction * 7)
  const date = dayDate(iso)
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + direction)
  return isoDate(date)
}
