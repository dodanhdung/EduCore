import { addDays, dayDate, isoDate } from './SchedulingDates.ts'

export type ScheduleDraft = {
  classId: string
  teacherId: string
  roomId: string
  format: 'IN_PERSON' | 'ONLINE'
  date: string
  start: string
  end: string
  repeat: 'SINGLE' | 'WEEKLY'
  weekdays: number[]
  repeatUntil: string
}

export type DraftErrors = Partial<Record<keyof ScheduleDraft, string>>

export function sixMonthLimit(start: string) {
  const date = dayDate(start)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + 6)
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, last))
  return isoDate(date)
}

export function validateDraft(draft: ScheduleDraft): DraftErrors {
  const errors: DraftErrors = {}
  if (!draft.classId) errors.classId = 'Chọn lớp học.'
  if (!draft.teacherId) errors.teacherId = 'Chọn giáo viên.'
  if (draft.format === 'IN_PERSON' && !draft.roomId) errors.roomId = 'Chọn phòng học.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(dayDate(draft.date).getTime()) || isoDate(dayDate(draft.date)) !== draft.date) errors.date = 'Chọn ngày bắt đầu hợp lệ.'
  if (!/^\d\d:\d\d$/.test(draft.start)) errors.start = 'Chọn giờ bắt đầu.'
  if (!/^\d\d:\d\d$/.test(draft.end) || draft.end <= draft.start) errors.end = 'Giờ kết thúc phải sau giờ bắt đầu.'
  if (draft.repeat === 'WEEKLY') {
    if (draft.weekdays.length !== 1 || !Number.isInteger(draft.weekdays[0]) || draft.weekdays[0] < 0 || draft.weekdays[0] > 6) errors.weekdays = 'Chọn đúng một thứ trong tuần.'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.repeatUntil) || Number.isNaN(dayDate(draft.repeatUntil).getTime()) || isoDate(dayDate(draft.repeatUntil)) !== draft.repeatUntil || draft.repeatUntil < draft.date) errors.repeatUntil = 'Ngày lặp đến phải từ ngày bắt đầu trở đi.'
    else if (!errors.date && draft.repeatUntil > sixMonthLimit(draft.date)) errors.repeatUntil = 'Khoảng lặp tối đa sáu tháng.'
    else if (!errors.date && draft.weekdays.length && !Array.from({ length: 7 }, (_, index) => addDays(draft.date, index)).some((date) => date <= draft.repeatUntil && draft.weekdays.includes(dayDate(date).getUTCDay()))) errors.repeatUntil = 'Không có buổi nào trong khoảng lặp.'
  }
  return errors
}

export function candidateDates(draft: ScheduleDraft) {
  if (Object.keys(validateDraft(draft)).length) return []
  if (draft.repeat === 'SINGLE') return [draft.date]
  const dates: string[] = []
  for (let date = draft.date; date <= draft.repeatUntil; date = addDays(date, 1)) {
    if (draft.weekdays.includes(dayDate(date).getUTCDay())) dates.push(date)
  }
  return dates
}
