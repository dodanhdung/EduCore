import type { AcademicMoreData } from '../AcademicTypes.ts'
import { AcademicCatalogPreview } from '../AcademicCatalogPreview.tsx'
export function ClassListScreen({ data, preview, navigate, tenantId, pathForDetail }: { data?: AcademicMoreData; preview: boolean; navigate: (path: string) => void; tenantId: string; pathForDetail?: (id: 'AC08', classId: string) => string }) { return <AcademicCatalogPreview id="AC07" data={data} preview={preview} navigate={navigate} tenantId={tenantId} pathForDetail={pathForDetail} /> }
