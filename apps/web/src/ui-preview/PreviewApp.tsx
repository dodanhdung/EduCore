import { useState } from 'react'
import type { Session, Tenant } from '../auth.ts'
import { TenantSelectionScreen } from '../screens/Authentication & Shared/AU02/TenantSelectionScreen.tsx'
import { ProfileScreen } from '../screens/Authentication & Shared/AU05/ProfileScreen.tsx'
import { NotificationScreen } from '../screens/Authentication & Shared/GL01/NotificationScreen.tsx'
import { AcademicScreen } from '../screens/Academic Management/AcademicScreens.tsx'
import type { AcademicId } from '../screens/Academic Management/AcademicScreens.tsx'
import { academicFixtures } from './academicFixtures.ts'
import { academicMoreFixtures } from './academicMoreFixtures.ts'
import { AcademicMoreScreen } from '../screens/Academic Management/AcademicMoreScreens.tsx'
import type { MoreId } from '../screens/Academic Management/AcademicMoreScreens.tsx'
import { AppShell } from '../App.tsx'
import { routes } from '../routes.ts'
import './preview.css'

type PreviewScreenId = 'AU02' | 'AU05' | 'GL01' | AcademicId | MoreId | 'AC09'

const sampleTenants: Tenant[] = [
  { id: 'demo-hcm-01', name: 'EduCore Quận 1' },
  { id: 'demo-hn-01', name: 'EduCore Cầu Giấy' },
]

const sampleSession: Session = {
  accessToken: 'PREVIEW_ONLY',
  csrfToken: 'PREVIEW_ONLY',
  expiresAt: new Date('2026-10-22T17:00:00+07:00').getTime(),
  tenantEpoch: 1,
  principal: {
    id: 'user-demo-001',
    sessionId: 'session-demo-001',
    tenantId: sampleTenants[0].id,
    allowedTenants: sampleTenants,
  },
}

const sampleNotifications = [
  {
    id: 'notice-demo-001',
    title: 'Lịch học đã được cập nhật',
    body: 'Buổi học Toán lớp 6A được chuyển sang 16:00, thứ Hai, ngày 26/10.',
    createdAt: '2026-10-20T08:30:00+07:00',
    read: false,
  },
  {
    id: 'notice-demo-002',
    title: 'Bài tập mới được giao',
    body: 'Bài tập “Phân số cơ bản” cần hoàn thành trước ngày 30/10.',
    createdAt: '2026-10-19T14:15:00+07:00',
    read: false,
  },
  {
    id: 'notice-demo-003',
    title: 'Chào mừng bạn đến với EduCore',
    body: 'Đây là thông báo mẫu đã đọc để xem trạng thái trong danh sách.',
    createdAt: '2026-10-17T09:00:00+07:00',
    read: true,
  },
]

export function PreviewApp({ screenId }: { screenId: string }) {
  const [selectedTenantId, setSelectedTenantId] = useState(sampleTenants[0].id)
  if (!(['AU02', 'AU05', 'GL01', 'AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07', 'AC08', 'AC09'] as string[]).includes(screenId)) {
    return <main className="ui-preview"><p role="alert">Màn hình preview không hợp lệ.</p></main>
  }

  const id = screenId as PreviewScreenId
  const selectedTenant = sampleTenants.find((tenant) => tenant.id === selectedTenantId) ?? sampleTenants[0]
  const navigate = (path: string) => { window.location.assign(path) }
  const query = new URLSearchParams(window.location.search)
  const selectedId = id === 'AC02' ? (query.get('studentId') ?? academicFixtures.students[0].id)
    : id === 'AC04' ? (query.get('teacherId') ?? academicFixtures.teachers[0].id)
      : (query.get('classId') ?? academicMoreFixtures.classes[0].code)

  return <main className={`ui-preview${id.startsWith('AC') ? ' ui-preview-academic' : ''}`}>
    <header className="ui-preview-banner">
      <div>
        <strong>Dữ liệu mẫu — UI Preview</strong>
        <span>Chỉ để xem giao diện · Không gọi API · Không tạo phiên đăng nhập</span>
      </div>
      <nav aria-label="Chọn màn hình preview">
        {(['AU02', 'AU05', 'GL01', 'AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07', 'AC08', 'AC09'] as const).map((item) => <a key={item} href={`/__ui-preview/${item}`} aria-current={id === item ? 'page' : undefined}>{item}</a>)}
      </nav>
    </header>
    <div className="ui-preview-content">
      {id === 'AU02' && <TenantSelectionScreen
        tenants={sampleTenants}
        onSelect={async (tenantId) => { setSelectedTenantId(tenantId) }}
        navigate={() => undefined}
      />}
      {id === 'AU05' && <ProfileScreen session={sampleSession} tenant={selectedTenant} onLogout={() => undefined} />}
      {id === 'GL01' && <NotificationScreen items={sampleNotifications} />}
      {id.startsWith('AC') && <AppShell route={routes.find((route) => route.id === (id === 'AC09' ? 'AC08' : id))!} tenant={selectedTenant} navigate={navigate} onLogout={() => undefined} preview previewNavigation={(['AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07', 'AC08', 'AC09'] as const).map((item) => <a key={item} href={`/__ui-preview/${item}`} aria-current={id === item ? 'page' : undefined}>{item}</a>)}>
        {(['AC01', 'AC02', 'AC03', 'AC04'] as string[]).includes(id)
          ? <AcademicScreen id={id as AcademicId} data={academicFixtures} preview tenantId={selectedTenant.id} navigate={navigate} selectedId={selectedId} pathForDetail={(detailId, personId) => `/__ui-preview/${detailId}?${detailId === 'AC02' ? 'studentId' : 'teacherId'}=${encodeURIComponent(personId)}`} />
          : <AcademicMoreScreen id={(id === 'AC09' ? 'AC08' : id) as MoreId} data={academicMoreFixtures} preview tenantId={selectedTenant.id} navigate={navigate} selectedId={selectedId} initialSheet={id === 'AC09'} pathForDetail={(detailId, classId) => `/__ui-preview/${detailId}?classId=${encodeURIComponent(classId)}`} pathForStudent={(studentId) => `/__ui-preview/AC02?studentId=${encodeURIComponent(studentId)}`} />}
      </AppShell>}
    </div>
  </main>
}
