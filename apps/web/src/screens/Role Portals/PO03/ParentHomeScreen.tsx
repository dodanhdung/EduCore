import { useState } from 'react'
import type { ChildSelection, PortalData, PortalSectionState } from '../PortalTypes.ts'
import { authorizedChild, portalScopeMatches, publishedResult, sectionMessage, selectedChildId, studentVisibleAssignments, verifiedChildren } from '../PortalTypes.ts'
import { PortalCard, PortalLink, PortalMoney, PortalPage, PortalState } from '../PortalPrimitives.tsx'

export function ParentHomeScreen({ data, navigate, path, initialChildId, viewerId, tenantId, onOpenBilling, onOpenLeave, onSelectChild, billingAvailable = true, billingState, debtVnd, production = false, state = 'ready' }: { data?: PortalData; navigate: (path: string) => void; path: (id: string, recordId?: string) => string; initialChildId?: string; viewerId?: string; tenantId?: string; onOpenBilling?: (studentId: string) => void; onOpenLeave?: (studentId: string) => void; onSelectChild?: (studentId: string) => void; billingAvailable?: boolean; billingState?: PortalSectionState; debtVnd?: string | null; production?: boolean; state?: 'ready' | 'loading' | 'forbidden' }) {
  const [selection, setSelection] = useState<ChildSelection>()
  if (state === 'forbidden') return <PortalState title="Không có quyền xem">Cần liên kết phụ huynh đang hiệu lực và đã xác minh.</PortalState>
  if (state === 'loading' || !data) return <PortalState title="Đang chờ liên kết học sinh">Chờ API xác nhận các học sinh được phép xem.</PortalState>
  if (!portalScopeMatches(data, viewerId, tenantId)) return <PortalState title="Đang chờ phạm vi xem mới">Chờ dữ liệu liên kết theo người xem và trung tâm hiện tại.</PortalState>
  const children = verifiedChildren(data)
  const context = `${tenantId ?? ''}:${viewerId ?? ''}`
  const requested = selectedChildId(data, context, initialChildId, selection)
  const child = authorizedChild(data, requested)
  if (!child) return <PortalState title={requested ? 'Không thể xem học sinh này' : 'Chưa có con được liên kết'}>{requested ? 'Liên kết đã thu hồi, chưa xác minh hoặc ngoài phạm vi được cấp.' : 'Chưa có liên kết phụ huynh đã xác minh.'}</PortalState>
  const sessions = data.sessions.filter((item) => item.studentIds.includes(child.studentId) && item.status === 'CONFIRMED' && item.startsAt >= data.sampleNow).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const assignments = studentVisibleAssignments(data, child.studentId)
  const published = assignments.map((item) => ({ item, grade: publishedResult(data, item.id, child.studentId) })).filter((row) => row.grade)
  const invoices = data.invoices.filter((item) => item.studentId === child.studentId && item.status === 'ISSUED' && item.outstandingVnd !== '0')
  const debt = production ? debtVnd ?? '0' : invoices.reduce((total, item) => total + BigInt(item.outstandingVnd), 0n).toString()
  return <PortalPage title="Trang chủ phụ huynh" detail={`Thông tin của con đã liên kết · ${child.name}`}>
    <PortalCard title="Chọn con cần xem" hint="Chỉ tài khoản học sinh có liên kết đã xác minh."><label className="portal-label" htmlFor="portal-parent-child">Học sinh</label><select className="portal-select" id="portal-parent-child" value={child.studentId} onChange={(event) => { setSelection({ context, initialChildId, selectedId: event.target.value }); onSelectChild?.(event.target.value) }}>{children.map((item) => <option key={item.studentId} value={item.studentId}>{item.name}</option>)}</select><p aria-live="polite" className="portal-muted">Đang xem: {child.name}</p></PortalCard>
    <div className="portal-grid"><PortalCard title="Buổi học tiếp theo">{data.availability?.schedule === false ? <p>Chưa có quyền xem lịch học.</p> : sessions[0] ? <p>{sessions[0].className} · {new Intl.DateTimeFormat('vi-VN', { timeZone: data.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(sessions[0].startsAt))}</p> : <p>Chưa có buổi học sắp tới.</p>}</PortalCard><PortalCard title="Bài tập và kết quả"><p>{data.availability?.assignments === false ? 'Chưa có quyền xem bài tập.' : `${assignments.length} bài đã giao · ${data.availability?.grades === false ? 'Điểm chưa khả dụng' : `${published.length} kết quả đã công bố`}`}</p></PortalCard><PortalCard title="Học phí còn nợ"><p>{sectionMessage(billingState, 'công nợ') ?? (billingAvailable ? <PortalMoney value={debt} /> : 'Chưa có quyền xem')}</p><small>Số tiền từ hóa đơn đã phát hành.</small></PortalCard></div>
    {!production && <PortalCard title="Thông báo trong ứng dụng">{data.notices.filter((item) => item.recipientId === child.studentId).length ? <ul className="portal-list">{data.notices.filter((item) => item.recipientId === child.studentId).map((item) => <li key={item.id}>{item.text}</li>)}</ul> : <p>Chưa có thông báo cho con đang xem.</p>}<PortalLink to={path('GL01')} navigate={navigate}>Xem thông báo</PortalLink></PortalCard>}
    <div className="portal-actions"><PortalLink to={path('PO04', child.studentId)} navigate={navigate}>Thông tin học tập</PortalLink>{onOpenBilling ? <button className="portal-link" type="button" onClick={() => onOpenBilling(child.studentId)}>Xem học phí</button> : <span className="portal-pending">Học phí: chờ xác thực phạm vi xem</span>}{onOpenLeave ? <button className="portal-link" type="button" onClick={() => onOpenLeave(child.studentId)}>Gửi đơn nghỉ cho con</button> : <span className="portal-pending">Đơn nghỉ: chờ xác thực con đang chọn</span>}</div>
  </PortalPage>
}
