import { useState } from 'react'
import type { ResourceBlock, ScheduleRoom, SchedulingData, SchedulingState } from '../SchedulingTypes.ts'
import { formatDate, tenantTimezone } from '../SchedulingDates.ts'
import { Panel, PendingAction, StatusBadge } from '../SchedulingPrimitives.tsx'
import '../SchedulingScreens.css'

type Tab = 'rooms' | 'blocks'
export function ResourcesScreen({ data, state = 'ready', preview = false, initialRoomId }: { data?: SchedulingData; state?: SchedulingState; preview?: boolean; initialRoomId?: string }) {
  const [tab, setTab] = useState<Tab>('rooms')
  const [search, setSearch] = useState('')
  const [capacity, setCapacity] = useState('')
  const [status, setStatus] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialRoomId ?? null)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'room' | 'block' | null>(null)
  const [form, setForm] = useState({ code: '', name: '', capacity: '', resource: '', from: '', to: '', reason: '' })
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState(false)
  const rooms = data?.rooms ?? []
  const blocks = data?.blocks ?? []
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId)
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId)
  const visibleRooms = rooms.filter((room) => `${room.id} ${room.name}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')) && (!capacity || room.capacity >= Number(capacity)) && (!status || room.status === status))
  const visibleBlocks = blocks.filter((block) => `${block.resourceName} ${block.reason}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')) && (!status || block.status === status))
  const open = (kind: 'room' | 'block') => { setDialog(kind); setFormError(''); setPending(false) }
  const validate = () => {
    if (dialog === 'room') {
      if (!form.code.trim() || !form.name.trim()) return 'Vui lòng nhập mã và tên phòng.'
      if (!Number.isInteger(Number(form.capacity)) || Number(form.capacity) < 1) return 'Sức chứa phải là số nguyên lớn hơn 0.'
    } else {
      if (!form.resource || !form.from || !form.to || !form.reason.trim()) return 'Vui lòng nhập tài nguyên, khoảng thời gian và lý do.'
      if (form.from >= form.to) return 'Thời điểm kết thúc phải sau thời điểm bắt đầu.'
    }
    return ''
  }
  const submit = () => { const error = validate(); setFormError(error); if (!error) setPending(true) }
  const field = (name: keyof typeof form, label: string, type = 'text') => <label className="scheduling-field" key={name}>{label}<input type={type} value={form[name]} onChange={(event) => { setForm({ ...form, [name]: event.target.value }); setFormError(''); setPending(false) }} /></label>
  const resourceSelect = <label className="scheduling-field">Tài nguyên<select value={form.resource} onChange={(event) => { setForm({ ...form, resource: event.target.value }); setFormError(''); setPending(false) }}><option value="">Chọn tài nguyên</option>{rooms.map((room) => <option value={room.id} key={room.id}>{room.id} · {room.name}</option>)}</select></label>

  return <div className="scheduling-page">
    <div className="scheduling-heading"><div><h1>Phòng học &amp; lịch bận tài nguyên</h1><p>Cơ sở hiện tại · {tenantTimezone} · {preview ? 'Dữ liệu mẫu' : 'Dữ liệu cần kết nối'}</p></div><button type="button" className="scheduling-primary" onClick={() => open('room')}>Thêm phòng học</button></div>
    <div className="scheduling-toolbar" role="tablist" aria-label="Loại tài nguyên"><button type="button" role="tab" aria-selected={tab === 'rooms'} onClick={() => setTab('rooms')}>Phòng học</button><button type="button" role="tab" aria-selected={tab === 'blocks'} onClick={() => setTab('blocks')}>Lịch bận</button></div>
    <div className="scheduling-metrics"><div><small>PHÒNG HOẠT ĐỘNG</small><strong>{rooms.filter((room) => room.status === 'ACTIVE').length}</strong><span>Trong cơ sở hiện tại</span></div><div><small>ĐANG SỬ DỤNG</small><strong>{new Set(data?.sessions.filter((session) => session.status === 'CONFIRMED').map((session) => session.roomId) ?? []).size}</strong><span>{preview ? 'Trong dữ liệu mẫu' : 'Chưa kết nối dữ liệu'}</span></div><div><small>LỊCH BẬN</small><strong>{blocks.filter((block) => block.status === 'CONFIRMED').length}</strong><span>Khoảng đã xác nhận</span></div></div>
    <Panel title="Bộ lọc theo phạm vi" hint="Chỉ hiện lịch và tài nguyên được cấp quyền."><div className="scheduling-filters"><label>Tìm tài nguyên<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Mã hoặc tên tài nguyên…" /></label>{tab === 'rooms' && <label>Sức chứa tối thiểu<input type="number" min="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>}<label>Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tất cả</option><option value={tab === 'rooms' ? 'ACTIVE' : 'CONFIRMED'}>{tab === 'rooms' ? 'Hoạt động' : 'Đã xác nhận'}</option><option value={tab === 'rooms' ? 'INACTIVE' : 'CANCELLED'}>{tab === 'rooms' ? 'Tạm ngưng' : 'Đã hủy'}</option></select></label><button type="button" className="scheduling-primary" onClick={() => { setSelectedRoomId(null); setSelectedBlockId(null) }}>Áp dụng</button></div></Panel>
    <Panel title={tab === 'rooms' ? 'Danh sách phòng học' : 'Khoảng không khả dụng'} hint="Dữ liệu minh họa · Chỉ hiển thị thông tin trong phạm vi được cấp quyền.">
      {state === 'loading' ? <p role="status" className="scheduling-empty">Đang tải tài nguyên…</p> : state === 'error' || !data ? <p role="alert" className="scheduling-empty">Chưa thể tải tài nguyên từ dịch vụ.</p> : (tab === 'rooms' ? visibleRooms.length : visibleBlocks.length) === 0 ? <p className="scheduling-empty">Không tìm thấy tài nguyên phù hợp.</p> : tab === 'rooms' ? <div className="scheduling-table-scroll"><table className="scheduling-table"><thead><tr><th>MÃ / PHÒNG</th><th>VỊ TRÍ</th><th>SỨC CHỨA</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>{visibleRooms.map((room: ScheduleRoom) => <tr key={room.id}><th>{room.id} · {room.name}</th><td>{room.location}</td><td>{room.capacity} học sinh</td><td><StatusBadge status={room.status} /></td><td><button type="button" className="scheduling-link" onClick={() => setSelectedRoomId(room.id)}>Xem lịch</button></td></tr>)}</tbody></table></div> : <div className="scheduling-table-scroll"><table className="scheduling-table"><thead><tr><th>TÀI NGUYÊN</th><th>KHOẢNG THỜI GIAN</th><th>LÝ DO</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>{visibleBlocks.map((block: ResourceBlock) => <tr key={block.id}><th>{block.resourceName}</th><td>{formatDate(block.date)} · {block.start}–{block.end}</td><td>{block.reason}</td><td><StatusBadge status={block.status} /></td><td><button type="button" className="scheduling-link" onClick={() => setSelectedBlockId(block.id)}>Xem chi tiết</button></td></tr>)}</tbody></table></div>}
    </Panel>
    {tab === 'rooms' && <div className="scheduling-detail-grid"><Panel title={selectedRoom ? `${selectedRoom.name} · ${selectedRoom.id}` : 'Chọn phòng học'}><p className="scheduling-hint">{selectedRoom ? `Sức chứa ${selectedRoom.capacity} · ${selectedRoom.location}` : 'Chọn “Xem lịch” để xem phòng và buổi liên quan.'}</p>{selectedRoomId && !selectedRoom && <p role="alert" className="scheduling-error">Không tìm thấy phòng theo mã đã chọn.</p>}{selectedRoom && <><StatusBadge status={selectedRoom.status} /><p className="scheduling-hint">{data?.sessions.filter((session) => session.roomId === selectedRoom.id).length ?? 0} buổi trong dữ liệu mẫu.</p><button type="button" onClick={() => { setForm({ ...form, code: selectedRoom.id, name: selectedRoom.name, capacity: String(selectedRoom.capacity) }); open('room') }}>Sửa thông tin phòng</button></>}</Panel><Panel title="Không khả dụng"><p className="scheduling-hint">{selectedRoom ? blocks.filter((block) => block.resourceId === selectedRoom.id).map((block) => `${formatDate(block.date)} · ${block.start}–${block.end} · ${block.reason}`).join('; ') || 'Không có khoảng bận mẫu.' : 'Chọn phòng để xem khoảng bận.'}</p><button type="button" onClick={() => open('block')}>Khai báo lịch bận</button></Panel></div>}
    {tab === 'blocks' && <Panel title="Thêm khoảng không khả dụng" hint="Kiểm tra chồng lấn với buổi đã xác nhận do dịch vụ thực hiện khi lưu."><button type="button" className="scheduling-primary" onClick={() => open('block')}>Khai báo lịch bận</button></Panel>}
    <Panel title="Kiểm tra tài nguyên"><p className="scheduling-hint">Sức chứa phòng phải đủ cho sĩ số buổi học. Lịch bận đã xác nhận chặn xếp lịch giao nhau.</p><p className="scheduling-hint">Thay đổi ảnh hưởng lịch đã xác nhận phải chỉ rõ buổi liên quan; không âm thầm hủy lịch.</p></Panel>
    {selectedBlock && <div className="scheduling-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedBlockId(null) }}><section className="scheduling-dialog" role="dialog" aria-modal="true" aria-label="Chi tiết lịch bận"><div className="scheduling-dialog-head"><h2>{selectedBlock.resourceName}</h2><button type="button" aria-label="Đóng" onClick={() => setSelectedBlockId(null)}>×</button></div><p>{formatDate(selectedBlock.date)} · {selectedBlock.start}–{selectedBlock.end}</p><p>{selectedBlock.reason}</p><StatusBadge status={selectedBlock.status} /></section></div>}
    {dialog && <div className="scheduling-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}><section className="scheduling-dialog" role="dialog" aria-modal="true" aria-label={dialog === 'room' ? 'Thông tin phòng học' : 'Khai báo lịch bận'}><div className="scheduling-dialog-head"><h2>{dialog === 'room' ? 'Thông tin phòng học' : 'Khai báo lịch bận'}</h2><button type="button" aria-label="Đóng" onClick={() => setDialog(null)}>×</button></div><div className="scheduling-form">{dialog === 'room' ? <>{field('code', 'Mã phòng')}{field('name', 'Tên phòng')}{field('capacity', 'Sức chứa', 'number')}</> : <>{resourceSelect}{field('from', 'Từ', 'datetime-local')}{field('to', 'Đến', 'datetime-local')}{field('reason', 'Lý do')}</>}{formError && <p role="alert" className="scheduling-error">{formError}</p>}{pending && <PendingAction>{dialog === 'room' ? 'Lưu phòng học' : 'Đăng ký lịch bận'}.</PendingAction>}<div className="scheduling-form-actions"><button type="button" onClick={() => setDialog(null)}>Đóng</button><button type="button" className="scheduling-primary" onClick={submit}>Kiểm tra thông tin</button></div></div></section></div>}
  </div>
}
