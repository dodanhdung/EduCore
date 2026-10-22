import { useState } from 'react'
import type { PortalData } from '../PortalTypes.ts'
import { authorizedChild, publishedResult, studentVisibleAssignments, verifiedChildren } from '../PortalTypes.ts'
import { PortalCard, PortalLink, PortalMoney, PortalPage, PortalState } from '../PortalPrimitives.tsx'

export function ParentHomeScreen({ data, navigate, path, initialChildId, state = 'ready' }: { data?: PortalData; navigate: (path: string) => void; path: (id: string, recordId?: string) => string; initialChildId?: string; state?: 'ready' | 'loading' | 'forbidden' }) {
  const [selectedId, setSelectedId] = useState<string | undefined>(initialChildId)
  if (state === 'forbidden') return <PortalState title="Không có quyền xem">Cần liên kết phụ huynh đang hiệu lực và đã xác minh.</PortalState>
  if (state === 'loading' || !data) return <PortalState title="Đang chờ liên kết học sinh">Chờ API xác nhận các học sinh được phép xem.</PortalState>
  const children = verifiedChildren(data)
  const requested = selectedId ?? (initialChildId === undefined ? children[0]?.studentId : initialChildId)
  const child = authorizedChild(data, requested)
  if (!child) return <PortalState title={requested ? 'Không thể xem học sinh này' : 'Chưa có con được liên kết'}>{requested ? 'Liên kết đã thu hồi, chưa xác minh hoặc ngoài phạm vi được cấp.' : 'Chưa có liên kết phụ huynh đã xác minh.'}</PortalState>
  const sessions = data.sessions.filter((item) => item.studentIds.includes(child.studentId) && item.status === 'CONFIRMED' && item.startsAt >= data.sampleNow).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const assignments = studentVisibleAssignments(data, child.studentId)
  const published = assignments.map((item) => ({ item, grade: publishedResult(data, item.id, child.studentId) })).filter((row) => row.grade)
  const invoices = data.invoices.filter((item) => item.studentId === child.studentId && item.status === 'ISSUED' && item.outstandingVnd !== '0')
  const debt = invoices.reduce((total, item) => total + BigInt(item.outstandingVnd), 0n).toString()
  return <PortalPage title="Trang chủ phụ huynh" detail={`Thông tin của con đã liên kết · ${child.name}`}>
    <PortalCard title="Chọn con cần xem" hint="Chỉ tài khoản học sinh có liên kết đã xác minh."><label className="portal-label" htmlFor="portal-parent-child">Học sinh</label><select className="portal-select" id="portal-parent-child" value={child.studentId} onChange={(event) => setSelectedId(event.target.value)}>{children.map((item) => <option key={item.studentId} value={item.studentId}>{item.name}</option>)}</select><p aria-live="polite" className="portal-muted">Đang xem: {child.name}</p></PortalCard>
    <div className="portal-grid"><PortalCard title="Buổi học tiếp theo">{sessions[0] ? <p>{sessions[0].className} · {new Intl.DateTimeFormat('vi-VN', { timeZone: data.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(sessions[0].startsAt))}</p> : <p>Chưa có buổi học sắp tới.</p>}</PortalCard><PortalCard title="Bài tập và kết quả"><p>{assignments.length} bài đã giao · {published.length} kết quả đã công bố</p></PortalCard><PortalCard title="Học phí còn nợ"><p><PortalMoney value={debt} /></p><small>Số tiền từ hóa đơn đã phát hành.</small></PortalCard></div>
    <PortalCard title="Thông báo trong ứng dụng">{data.notices.filter((item) => item.recipientId === child.studentId).length ? <ul className="portal-list">{data.notices.filter((item) => item.recipientId === child.studentId).map((item) => <li key={item.id}>{item.text}</li>)}</ul> : <p>Chưa có thông báo cho con đang xem.</p>}<PortalLink to={path('GL01')} navigate={navigate}>Xem thông báo</PortalLink></PortalCard>
    <div className="portal-actions"><PortalLink to={path('PO04', child.studentId)} navigate={navigate}>Thông tin học tập</PortalLink><PortalLink to={path('PO05', child.studentId)} navigate={navigate}>Xem học phí</PortalLink><PortalLink to={path('AT03', child.studentId)} navigate={navigate}>Gửi đơn nghỉ cho con</PortalLink></div>
  </PortalPage>
}
