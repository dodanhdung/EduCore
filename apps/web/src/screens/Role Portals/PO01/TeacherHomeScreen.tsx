import type { PortalData } from '../PortalTypes.ts'
import { ResourceState } from '../../../shared/ui/SharedUI.tsx'
import { TeacherHomeView } from './TeacherHomeView.tsx'
import { fromTeacherFixture, fromTeacherLive } from './TeacherHomeViewModel.ts'

/** Both adapters render the same PO01 task presentation. */
export function TeacherHomeScreen({ data, teacherId, navigate, path, production = false, incomplete = false, state = 'ready' }: {
  data?: PortalData; teacherId?: string; navigate: (path: string) => void;
  path: (id: string, recordId?: string) => string; production?: boolean; incomplete?: boolean;
  state?: 'ready' | 'loading' | 'forbidden'
}) {
  if (state === 'forbidden') return <ResourceState kind="forbidden" title="Không có quyền xem" detail="Cần quyền giáo viên và phạm vi lớp được phân công." />
  if (state === 'loading') return <ResourceState kind="loading" detail="Đang tải dữ liệu giảng dạy." />
  if (!data || !teacherId) return <ResourceState kind="unavailable" title="Đang chờ dữ liệu giảng dạy" detail="Chờ API trả các buổi và bài tập trong phạm vi phân công của giáo viên." />
  return <TeacherHomeView model={production ? fromTeacherLive(data, teacherId, incomplete) : fromTeacherFixture(data, teacherId)}
    navigate={navigate} path={path} />
}
