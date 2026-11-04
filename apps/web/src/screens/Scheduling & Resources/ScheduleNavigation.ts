export type CalendarContext = { date?: string; mode?: 'day' | 'week' | 'month'; classId?: string; teacherId?: string; roomId?: string }
export function validMonth(value: string | null): value is string { return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) }
export function readCalendarContext(search: string): CalendarContext {
  const query = new URLSearchParams(search), context: CalendarContext = {}
  const date = query.get('date')
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date) context.date = date
  const mode = query.get('mode')
  if (mode === 'day' || mode === 'week' || mode === 'month') context.mode = mode
  for (const key of ['classId', 'teacherId', 'roomId'] as const) {
    const id = query.get(key)
    if (id && /^[a-zA-Z0-9_-]{1,100}$/.test(id)) context[key] = id
  }
  return context
}
export function calendarQuery(context: CalendarContext) {
  const validated = readCalendarContext(new URLSearchParams(context).toString())
  return new URLSearchParams(validated).toString()
}
export function calendarPath(context: CalendarContext) {
  const query = calendarQuery(context)
  return `/schedule${query ? `?${query}` : ''}`
}
export function sessionPath(id: string, context: CalendarContext) {
  const query = calendarQuery(context)
  return `/schedule/sessions/${encodeURIComponent(id)}${query ? `?${query}` : ''}`
}
export function attendanceViewPath(id: string, from: 'SC05' | 'AT01', context: CalendarContext = {}, month?: string) {
  const query = new URLSearchParams(calendarQuery(context))
  query.set('view', 'read'); query.set('from', from)
  if (validMonth(month ?? null)) query.set('month', month!)
  return `/sessions/${encodeURIComponent(id)}/attendance?${query}`
}
