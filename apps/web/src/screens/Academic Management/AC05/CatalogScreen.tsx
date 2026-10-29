import type { AcademicMoreData } from '../AcademicTypes.ts'
import { AcademicCatalogPreview } from '../AcademicCatalogPreview.tsx'
export function CatalogScreen({ data, preview }: { data?: AcademicMoreData; preview: boolean }) { return <AcademicCatalogPreview id="AC05" data={data} preview={preview} /> }
