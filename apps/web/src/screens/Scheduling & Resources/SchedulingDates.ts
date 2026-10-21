export const tenantTimezone = 'Asia/Ho_Chi_Minh'
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
