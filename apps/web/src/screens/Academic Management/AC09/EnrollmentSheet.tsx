import { useState } from 'react'
import { Card, Tabs, Field, Select } from '../AcademicMorePrimitives.tsx'
import type { WizardSample } from '../AcademicTypes.ts'

export function EnrollmentSheet({ onClose, initialMode = 'Ghi danh', sample }: { onClose: () => void; initialMode?: 'Ghi danh' | 'Chuyển lớp'; sample?: WizardSample }) {
  const [mode, setMode] = useState(initialMode)
  const [step, setStep] = useState(1)
  const [student, setStudent] = useState(sample?.student ?? '')
  const [destination, setDestination] = useState(sample?.destination ?? '')
  const [effective, setEffective] = useState(sample?.effective ?? '')
  const [conflict, setConflict] = useState('Không có kết quả kiểm tra từ API')
  const [attempted, setAttempted] = useState(false)
  const missing = !student.trim() || !destination.trim() || !effective.trim()
  return <div className="academic-overlay academic-sheet-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside className="academic-sheet" role="dialog" aria-modal="true" aria-labelledby="enrollment-title" onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}>
    <header className="academic-sheet-head"><div><h2 id="enrollment-title">Ghi danh / chuyển lớp</h2><p>AC09 · {sample ? 'Dữ liệu mẫu' : 'Chờ API'}</p></div><button onClick={onClose}>Đóng</button></header>
    <Tabs items={['Ghi danh', 'Chuyển lớp']} value={mode} onChange={(value) => { setMode(value as 'Ghi danh' | 'Chuyển lớp'); setStep(1) }} label="Loại thao tác" />
    <div className="academic-steps" aria-label="Các bước ghi danh">{['1 · Chọn lớp', '2 · Kiểm tra', '3 · Xác nhận'].map((label, index) => <button key={label} aria-current={step === index + 1 ? 'step' : undefined} onClick={() => setStep(index + 1)}>{label}</button>)}</div>
    <Card title="Lớp và thời điểm hiệu lực" hint="Chỉ áp dụng từ buổi học tương lai chưa diễn ra."><div className="academic-form"><Field label="Học sinh" value={student} onChange={setStudent} error={attempted && !student.trim()} /><div className="academic-fields">{mode === 'Chuyển lớp' && <div className="academic-field"><span>Lớp hiện tại</span><div>{sample?.source ?? 'Chờ API'}</div></div>}<Field label="Lớp đích" value={destination} onChange={setDestination} error={attempted && !destination.trim()} /></div><Field label="Có hiệu lực từ buổi" value={effective} onChange={setEffective} error={attempted && !effective.trim()} />{attempted && missing && <p role="alert" className="academic-error">Vui lòng nhập học sinh, lớp đích và thời điểm hiệu lực.</p>}</div></Card>
    <Card title="Kết quả kiểm tra" hint="Phải kiểm tra lại khi xác nhận."><div className="academic-checks"><span>Chỗ trống · Chờ API</span><span>Trình độ · Chờ API</span><span>Lịch học · Chờ API</span></div><p className="academic-hint">Không xác nhận sức chứa, năng lực, lịch hoặc quyền bằng dữ liệu mẫu.</p></Card>
    <Card title="Trước khi xác nhận" hint="Lịch sử ghi danh lớp cũ vẫn được giữ."><p className="academic-hint">{mode === 'Chuyển lớp' ? 'Chuyển lớp cần hiệu lực tương lai và xác nhận thủ công. Chênh lệch trên hóa đơn đã phát hành phải chuyển sang luồng xem xét điều chỉnh BL10.' : 'Ghi danh chỉ được áp dụng sau khi API xác nhận điều kiện và quyền hiệu lực.'}</p></Card>
    <Card title="Khi kiểm tra không đạt" hint="Không xác nhận một phần."><Select label="Xem biến thể lỗi" value={conflict} onChange={setConflict} options={['Không có kết quả kiểm tra từ API', 'Lớp đã đủ chỗ', 'Trùng lịch học', 'Không đủ quyền', 'Hiệu lực chưa hợp lệ', 'Thao tác không hoàn tất']} /><p role="status" className="academic-error">{conflict === 'Không có kết quả kiểm tra từ API' ? 'Chưa thể xác nhận điều kiện.' : `${conflict}: giữ dữ liệu đã nhập để sửa hoặc tải lại.`}</p></Card>
    <div className="academic-sheet-actions"><button onClick={onClose}>Hủy</button><button disabled={step === 3} onClick={() => { setAttempted(true); if (!missing) setStep(Math.min(3, step + 1)) }}>{step === 3 ? 'Xác nhận · Chờ API' : 'Tiếp tục'}</button></div>
  </aside></div>
}
