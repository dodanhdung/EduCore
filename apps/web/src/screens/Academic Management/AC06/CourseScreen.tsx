import type { AcademicMoreData } from '../AcademicTypes.ts'
import { AcademicCatalogPreview } from '../AcademicCatalogPreview.tsx'
export function CourseScreen({ data, preview }: { data?: AcademicMoreData; preview: boolean }) { return <AcademicCatalogPreview id="AC06" data={data} preview={preview} /> }
