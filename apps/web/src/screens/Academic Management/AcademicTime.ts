/** Interpret a datetime-local value in the selected tenant's IANA timezone. */
export function tenantLocalToUtc(local: string, zone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) || !zone) return null
  const wall = new Date(`${local}:00Z`)
  if (Number.isNaN(wall.valueOf()) || wall.toISOString().slice(0, 16) !== local) return null
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    })
    const wallAt = (instant: number) => {
      const fields = Object.fromEntries(formatter.formatToParts(new Date(instant))
        .filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
      return Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second)
    }
    let instant = wall.valueOf()
    for (let i = 0; i < 4; i++) {
      const delta = wall.valueOf() - wallAt(instant)
      if (delta === 0) break
      instant += delta
    }
    if (wallAt(instant) !== wall.valueOf()) return null // DST gap
    for (const offset of [-120, -90, -60, -30, 30, 60, 90, 120]) {
      if (wallAt(instant + offset * 60_000) === wall.valueOf()) return null // ambiguous DST hour
    }
    return new Date(instant).toISOString()
  } catch { return null }
}
