import { useState } from 'react'
import type { ResourceBlock, ScheduleRoom, SchedulingData, SchedulingState } from '../SchedulingTypes.ts'
import { formatDate, timezoneLabel } from '../SchedulingDates.ts'
import { Panel, PendingAction, StatusBadge } from '../SchedulingPrimitives.tsx'
import '../SchedulingScreens.css'

type Tab = 'rooms' | 'blocks'
type DialogMode = 'create-room' | 'edit-room' | 'block'
const blankForm = () => ({ code: '', name: '', capacity: '', active: 'true', resource: '', from: '', to: '', reason: '' })
type ResourceActions = {
  canManageRooms?: boolean; canManageResources?: boolean; busy?: boolean
  createRoom?: (form: ReturnType<typeof blankForm>) => Promise<boolean>
  updateRoom?: (roomId: string, form: ReturnType<typeof blankForm>) => Promise<boolean>
  createBlock?: (form: ReturnType<typeof blankForm>) => Promise<boolean>
  confirmBlock?: (id: string) => Promise<boolean>
  cancelBlock?: (id: string) => Promise<boolean>
}
export function ResourcesScreen({ data, state = 'ready', preview = false, initialRoomId, timeZone, actions }: { data?: SchedulingData; state?: SchedulingState; preview?: boolean; initialRoomId?: string; timeZone?: string; actions?: ResourceActions }) {
  const [tab, setTab] = useState<Tab>('rooms')
  const [search, setSearch] = useState('')
  const [capacity, setCapacity] = useState('')
  const [status, setStatus] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialRoomId ?? null)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogMode | null>(null)
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null)
  const [form, setForm] = useState(blankForm)
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState(false)
  const rooms = data?.rooms ?? []
  const blocks = data?.blocks ?? []
  const visibleRooms = rooms.filter((room) => `${room.code ?? room.id} ${room.name}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')) && (!capacity || room.capacity >= Number(capacity)) && (!status || room.status === status))
  const visibleBlocks = blocks.filter((block) => `${block.resourceName} ${block.reason}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')) && (!status || block.status === status))
  const selectedRoom = visibleRooms.find((room) => room.id === selectedRoomId)
  const selectedBlock = visibleBlocks.find((block) => block.id === selectedBlockId)
  const begin = (mode: DialogMode, room?: ScheduleRoom) => {
    setDialog(mode)
    setEditingRoomId(mode === 'edit-room' ? room?.id ?? null : null)
    setForm(mode === 'edit-room' && room ? { ...blankForm(), code: room.code ?? room.id, name: room.name, capacity: String(room.capacity), active: String(room.status === 'ACTIVE') } : blankForm())
    setFormError('')
    setPending(false)
  }
  const validate = () => {
    if (dialog === 'create-room' || dialog === 'edit-room') {
      if (!form.code.trim() || !form.name.trim()) return 'Vui lòng nhập mã và tên phòng.'
      if (!Number.isInteger(Number(form.capacity)) || Number(form.capacity) < 1) return 'Sức chứa phải là số nguyên lớn hơn 0.'
      if (actions && !form.reason.trim()) return 'Vui lòng nhập lý do.'
    } else {
      if (!form.resource || !form.from || !form.to || !form.reason.trim()) return 'Vui lòng nhập tài nguyên, khoảng thời gian và lý do.'
      if (form.from >= form.to) return 'Thời điểm kết thúc phải sau thời điểm bắt đầu.'
    }
    return ''
  }
  const submit = async () => { const error = validate(); setFormError(error); if (error) return; if (!actions) { setPending(true); return }
    const saved = dialog === 'create-room' ? await actions.createRoom?.(form) : dialog === 'edit-room' && editingRoomId ? await actions.updateRoom?.(editingRoomId, form) : await actions.createBlock?.(form)
    if (saved) setDialog(null)
  }
  const field = (name: keyof typeof form, label: string, type = 'text') => <label className="scheduling-field" key={name}>{label}<input type={type} value={form[name]} readOnly={dialog === 'edit-room' && name === 'code'} onChange={(event) => { setForm({ ...form, [name]: event.target.value }); setFormError(''); setPending(false) }} /></label>
  const resourceSelect = <label className="scheduling-field">Tài nguyên<select value={form.resource} onChange={(event) => { setForm({ ...form, resource: event.target.value }); setFormError(''); setPending(false) }}><option value="">Chọn tài nguyên</option>{(actions ? data?.resources ?? [] : rooms.map((room) => ({ id: room.id, name: room.name }))).map((resource) => <option value={resource.id} key={resource.id}>{resource.name}</option>)}</select></label>

  return <div className="scheduling-page">
    <div className="scheduling-heading"><div><h1>Phòng học &amp; lịch bận tài nguyên</h1><p>Cơ sở hiện tại · {timezoneLabel(timeZone)}{preview ? ' · Dữ liệu mẫu' : ''}</p></div>{(!actions || actions.canManageRooms) && <button type="button" className="scheduling-primary" onClick={() => begin('create-room')}>Thêm phòng học</button>}</div>
    <div className="scheduling-toolbar" role="tablist" aria-label="Loại tài nguyên"><button type="button" role="tab" aria-selected={tab === 'rooms'} onClick={() => { setTab('rooms'); setStatus(''); setSelectedBlockId(null) }}>Phòng học</button><button type="button" role="tab" aria-selected={tab === 'blocks'} onClick={() => { setTab('blocks'); setStatus(''); setSelectedRoomId(null) }}>Lịch bận</button></div>
    <div className="scheduling-metrics"><div><small>PHÒNG HOẠT ĐỘNG</small><strong>{rooms.filter((room) => room.status === 'ACTIVE').length}</strong><span>Trong cơ sở hiện tại</span></div><div><small>ĐANG SỬ DỤNG</small><strong>{actions ? '—' : new Set(data?.sessions.filter((session) => session.status === 'CONFIRMED').map((session) => session.roomId) ?? []).size}</strong><span>{preview ? 'Trong dữ liệu mẫu' : 'Chưa có dữ liệu sử dụng tại thời điểm hiện tại'}</span></div><div><small>LỊCH BẬN</small><strong>{blocks.filter((block) => block.status === 'CONFIRMED').length}</strong><span>Khoảng đã xác nhận</span></div></div>
    <Panel title="Bộ lọc theo phạm vi" hint="Chỉ hiện lịch và tài nguyên được cấp quyền."><div className="scheduling-filters"><label>Tìm tài nguyên<input value={search} onChange={(event) => { setSearch(event.target.value); setSelectedRoomId(null); setSelectedBlockId(null) }} placeholder="Mã hoặc tên tài nguyên…" /></label>{tab === 'rooms' && <label>Sức chứa tối thiểu<input type="number" min="1" value={capacity} onChange={(event) => { setCapacity(event.target.value); setSelectedRoomId(null) }} /></label>}<label>Trạng thái<select value={status} onChange={(event) => { setStatus(event.target.value); setSelectedRoomId(null); setSelectedBlockId(null) }}><option value="">Tất cả</option><option value={tab === 'rooms' ? 'ACTIVE' : 'CONFIRMED'}>{tab === 'rooms' ? 'Hoạt động' : 'Đã xác nhận'}</option><option value={tab === 'rooms' ? 'INACTIVE' : 'CANCELLED'}>{tab === 'rooms' ? 'Tạm ngưng' : 'Đã hủy'}</option>{tab === 'blocks' && <option value="DRAFT">Bản nháp</option>}</select></label></div></Panel>
    <Panel title={tab === 'rooms' ? 'Danh sách phòng học' : 'Khoảng không khả dụng'} hint={`${preview ? 'Dữ liệu mẫu · ' : ''}Chỉ hiển thị thông tin trong phạm vi được cấp quyền.`}>
      {state === 'loading' ? <p role="status" className="scheduling-empty">Đang tải tài nguyên…</p> : state === 'error' || !data ? <p role="alert" className="scheduling-empty">Chưa thể tải tài nguyên từ dịch vụ.</p> : (tab === 'rooms' ? visibleRooms.length : visibleBlocks.length) === 0 ? <p className="scheduling-empty">Không tìm thấy tài nguyên phù hợp.</p> : tab === 'rooms' ? <div className="scheduling-table-scroll"><table className="scheduling-table"><thead><tr><th>MÃ / PHÒNG</th><th>VỊ TRÍ</th><th>SỨC CHỨA</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>{visibleRooms.map((room: ScheduleRoom) => <tr key={room.id}><th>{room.code ?? room.id} · {room.name}</th><td>{room.location}</td><td>{room.capacity} học sinh</td><td><StatusBadge status={room.status} /></td><td><button type="button" className="scheduling-link" onClick={() => setSelectedRoomId(room.id)}>Xem lịch</button></td></tr>)}</tbody></table></div> : <div className="scheduling-table-scroll"><table className="scheduling-table"><thead><tr><th>TÀI NGUYÊN</th><th>KHOẢNG THỜI GIAN</th><th>LÝ DO</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>{visibleBlocks.map((block: ResourceBlock) => <tr key={block.id}><th>{block.resourceName}</th><td>{formatDate(block.date)} · {block.start}–{block.end}</td><td>{block.reason}</td><td><StatusBadge status={block.status} /></td><td><button type="button" className="scheduling-link" onClick={() => setSelectedBlockId(block.id)}>Xem chi tiết</button></td></tr>)}</tbody></table></div>}
    </Panel>
    {tab === 'rooms' && <div className="scheduling-detail-grid"><Panel title={selectedRoom ? `${selectedRoom.name} · ${selectedRoom.code ?? selectedRoom.id}` : 'Chọn phòng học'}><p className="scheduling-hint">{selectedRoom ? `Sức chứa ${selectedRoom.capacity} · ${selectedRoom.location}` : 'Chọn “Xem lịch” để xem phòng và buổi liên quan.'}</p>{selectedRoomId && !selectedRoom && <p role="alert" className="scheduling-error">Không tìm thấy phòng theo mã đã chọn.</p>}{selectedRoom && <><StatusBadge status={selectedRoom.status} />{preview && <p className="scheduling-hint">{data?.sessions.filter((session) => session.roomId === selectedRoom.id).length ?? 0} buổi trong dữ liệu mẫu.</p>}{(!actions || actions.canManageRooms) && <button type="button" onClick={() => begin('edit-room', selectedRoom)}>Sửa thông tin phòng</button>}</>}</Panel><Panel title="Không khả dụng"><p className="scheduling-hint">{selectedRoom ? blocks.filter((block) => block.roomId === selectedRoom.id || block.resourceId === selectedRoom.id).map((block) => `${formatDate(block.date)} · ${block.start}–${block.end} · ${block.reason}`).join('; ') || 'Không có khoảng bận.' : 'Chọn phòng để xem khoảng bận.'}</p>{(!actions || actions.canManageResources) && <button type="button" onClick={() => begin('block')}>Khai báo lịch bận</button>}</Panel></div>}
    {tab === 'blocks' && (!actions || actions.canManageResources) && <Panel title="Thêm khoảng không khả dụng" hint="Kiểm tra chồng lấn với buổi đã xác nhận do dịch vụ thực hiện khi lưu."><button type="button" className="scheduling-primary" onClick={() => begin('block')}>Khai báo lịch bận</button></Panel>}
    <Panel title="Kiểm tra tài nguyên"><p className="scheduling-hint">Sức chứa phòng phải đủ cho sĩ số buổi học. Lịch bận đã xác nhận chặn xếp lịch giao nhau.</p><p className="scheduling-hint">Thay đổi ảnh hưởng lịch đã xác nhận phải chỉ rõ buổi liên quan; không âm thầm hủy lịch.</p></Panel>
    {selectedBlock && <div className="scheduling-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedBlockId(null) }}><section className="scheduling-dialog" role="dialog" aria-modal="true" aria-label="Chi tiết lịch bận"><div className="scheduling-dialog-head"><h2>{selectedBlock.resourceName}</h2><button type="button" aria-label="Đóng" onClick={() => setSelectedBlockId(null)}>×</button></div><p>{formatDate(selectedBlock.date)} · {selectedBlock.start}–{selectedBlock.end}</p><p>{selectedBlock.reason}</p><StatusBadge status={selectedBlock.status} />{actions?.canManageResources && selectedBlock.status === 'DRAFT' && <button type="button" disabled={actions.busy} onClick={async () => { if (await actions.confirmBlock?.(selectedBlock.id)) setSelectedBlockId(null) }}>Xác nhận lịch bận</button>}{actions?.canManageResources && selectedBlock.status !== 'CANCELLED' && <button type="button" disabled={actions.busy} onClick={async () => { if (await actions.cancelBlock?.(selectedBlock.id)) setSelectedBlockId(null) }}>Hủy lịch bận</button>}</section></div>}
    {dialog && <div className="scheduling-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}><section className="scheduling-dialog" role="dialog" aria-modal="true" aria-label={dialog === 'create-room' ? 'Thêm phòng học' : dialog === 'edit-room' ? `Sửa phòng ${editingRoomId}` : 'Khai báo lịch bận'}><div className="scheduling-dialog-head"><h2>{dialog === 'create-room' ? 'Thêm phòng học' : dialog === 'edit-room' ? `Sửa phòng ${editingRoomId}` : 'Khai báo lịch bận'}</h2><button type="button" aria-label="Đóng" onClick={() => setDialog(null)}>×</button></div><div className="scheduling-form">{dialog !== 'block' ? <>{field('code', 'Mã phòng')}{field('name', 'Tên phòng')}{field('capacity', 'Sức chứa', 'number')}{actions && dialog === 'edit-room' && <label className="scheduling-field">Trạng thái<select value={form.active} onChange={(event) => setForm({ ...form, active: event.target.value })}><option value="true">Hoạt động</option><option value="false">Tạm ngưng</option></select></label>}{actions && field('reason', 'Lý do')}</> : <>{resourceSelect}{field('from', 'Từ', 'datetime-local')}{field('to', 'Đến', 'datetime-local')}{field('reason', 'Lý do')}</>}{formError && <p role="alert" className="scheduling-error">{formError}</p>}{pending && <PendingAction>{dialog === 'block' ? 'Đăng ký lịch bận' : 'Lưu phòng học'}.</PendingAction>}<div className="scheduling-form-actions"><button type="button" onClick={() => setDialog(null)}>Đóng</button><button type="button" className="scheduling-primary" disabled={actions?.busy} onClick={() => { void submit() }}>{actions ? 'Lưu trên máy chủ' : 'Kiểm tra thông tin'}</button></div></div></section></div>}
  </div>
}
