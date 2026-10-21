import { useState } from 'react'
import type { AttendanceData, AttendancePhase } from '../AttendanceTypes.ts'
import { AttendanceBadge, AttendanceCard, AttendanceHeading, AttendanceState } from '../AttendancePrimitives.tsx'
import { formatAttendanceDate } from '../AttendanceText.ts'
import '../AttendanceScreens.css'

type Tab = 'open' | 'today' | 'overdue' | 'finalized'
export function AttendanceSessionListScreen({ data, preview = false, state = 'ready', onOpenSession }: {
  data?: AttendanceData; preview?: boolean; state?: 'ready' | 'loading' | 'forbidden' | 'error'; onOpenSession?: (id: string) => void
}) {
  const [tab, setTab] = useState<Tab>('open')
  const [search, setSearch] = useState('')
  const [classId, setClassId] = useState('all')
  const [phase, setPhase] = useState<AttendancePhase | 'all'>('all')
  const [day, setDay] = useState('')
  const [applied, setApplied] = useState({ classId: 'all', phase: 'all', day: '' })
  const sessions = data?.sessions ?? []
  const overdue = (item: typeof sessions[number]) => item.phase !== 'FINALIZED' && item.phase !== 'LOCKED' && item.date < (data?.sampleNow.slice(0, 10) ?? '')
  const visible = sessions.filter((item) => {
    const matchesTab = tab === 'open' ? item.phase === 'DRAFT' || item.phase === 'PARTIAL' : tab === 'today' ? item.date === data?.sampleNow.slice(0, 10) : tab === 'overdue' ? overdue(item) : item.phase === 'FINALIZED' || item.phase === 'LOCKED'
    return matchesTab && (applied.classId === 'all' || item.classId === applied.classId) && (applied.phase === 'all' || item.phase === applied.phase) && (!applied.day || item.date === applied.day) && `${item.classId} ${item.className} ${item.teacherName}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))
  })
  return <div className="attendance-page">
    <AttendanceHeading title="Buổi cần điểm danh" subtitle={preview ? 'Buổi được phân công · Dữ liệu mẫu' : 'Buổi học trong phạm vi được cấp quyền'} />
    {!data ? <AttendanceState title="Chưa có dữ liệu điểm danh" alert>Chờ API tải các buổi được phân công và quyền hiệu lực.</AttendanceState>
      : state === 'loading' ? <AttendanceState title="Đang tải buổi học">Vui lòng chờ trong giây lát.</AttendanceState>
        : state === 'forbidden' ? <AttendanceState title="Không có quyền xem" alert>Chỉ hiển thị buổi trong tenant và phạm vi được cấp quyền.</AttendanceState>
          : state === 'error' ? <AttendanceState title="Không thể tải buổi học" alert>Thử lại khi kết nối khả dụng.</AttendanceState> : <>
            <div className="attendance-tabs" role="tablist" aria-label="Nhóm buổi điểm danh">{([['open', 'Cần xử lý'], ['today', 'Hôm nay'], ['overdue', 'Quá hạn'], ['finalized', 'Đã xác nhận']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
            <div className="attendance-metrics"><div><small>CẦN XỬ LÝ</small><strong>{sessions.filter((item) => item.phase === 'DRAFT' || item.phase === 'PARTIAL').length.toString().padStart(2, '0')}</strong><span>Hôm nay và buổi gần nhất</span></div><div><small>QUÁ HẠN</small><strong>{sessions.filter(overdue).length.toString().padStart(2, '0')}</strong><span>Cần người có quyền xử lý</span></div><div><small>ĐÃ XÁC NHẬN</small><strong>{sessions.filter((item) => item.phase === 'FINALIZED' || item.phase === 'LOCKED').length.toString().padStart(2, '0')}</strong><span>Không tự suy ra từ dữ liệu Preview</span></div></div>
            <AttendanceCard title="Bộ lọc theo phạm vi" hint="Chỉ hiện dữ liệu trong phạm vi được cấp quyền."><div className="attendance-filters"><label>Lớp<select value={classId} onChange={(event) => setClassId(event.target.value)}><option value="all">Tất cả lớp được phân công</option>{[...new Map(sessions.map((item) => [item.classId, item.className])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Ngày học<input type="date" value={day} onChange={(event) => setDay(event.target.value)} /></label><label>Trạng thái<select value={phase} onChange={(event) => setPhase(event.target.value as AttendancePhase | 'all')}><option value="all">Tất cả trạng thái</option>{(['DRAFT', 'PARTIAL', 'FINALIZED', 'LOCKED'] as const).map((item) => <option key={item} value={item}>{item === 'PARTIAL' ? 'Chưa xác nhận' : item === 'DRAFT' ? 'Bản nháp' : item === 'FINALIZED' ? 'Đã xác nhận' : 'Đã khóa'}</option>)}</select></label><button className="attendance-primary" type="button" onClick={() => setApplied({ classId, phase, day })}>Áp dụng</button></div></AttendanceCard>
            <AttendanceCard title="Danh sách buổi theo phạm vi" hint={preview ? 'Dữ liệu minh họa; phạm vi theo tenant và quyền hiệu lực.' : 'Dữ liệu trong phạm vi được cấp quyền.'}><label className="attendance-search">Tìm buổi học<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo lớp hoặc giáo viên..." /></label>{visible.length ? <div className="attendance-table-wrap"><table className="attendance-table"><thead><tr><th>BUỔI / LỚP</th><th>THỜI GIAN</th><th>GIÁO VIÊN</th><th>HỌC SINH</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td data-label="Buổi / lớp"><strong>{item.classId}</strong><small>{item.className}</small></td><td data-label="Thời gian">{formatAttendanceDate(item.date)} · {item.start}–{item.end}</td><td data-label="Giáo viên">{item.teacherName}</td><td data-label="Học sinh">{data.rosters[item.id]?.length ?? 0}/{item.expectedCount}</td><td data-label="Trạng thái"><AttendanceBadge value={item.phase} /></td><td data-label="Thao tác"><button className="attendance-link" type="button" onClick={() => onOpenSession?.(item.id)}>{item.phase === 'LOCKED' ? 'Xem kết quả' : 'Mở điểm danh'}</button></td></tr>)}</tbody></table></div> : <AttendanceState title={sessions.length ? 'Không có kết quả phù hợp' : 'Không có buổi được phân công'}>{sessions.length ? 'Thử từ khóa, ngày hoặc bộ lọc khác.' : 'Danh sách sẽ xuất hiện khi có buổi học hợp lệ trong phạm vi.'}</AttendanceState>}</AttendanceCard>
            <AttendanceCard title="Mốc khóa và xử lý quá hạn"><p>Sửa thường khóa sau 48 giờ từ cuối buổi hoặc khi dữ liệu được dùng phát hành hóa đơn, tùy mốc đến trước. Buổi quá hạn không tự xác nhận.</p></AttendanceCard>
          </>}
  </div>
}
