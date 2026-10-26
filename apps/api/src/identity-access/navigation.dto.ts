import { InternalServerErrorException } from '@nestjs/common';

export const NAVIGATION_SCREENS = ['AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07', 'AC08',
  'AS01', 'AS02', 'AS03', 'AS04', 'AS05', 'AS06', 'AS07',
  'AT01', 'AT02', 'AT03', 'AT04',
  'BL01', 'BL02', 'BL03', 'BL04', 'BL05', 'BL06', 'BL07',
  'G01', 'GL01', 'OP01', 'OP02', 'OP03', 'OP04', 'OP05', 'OP06', 'OP07',
  'PO01', 'PO02', 'PO03', 'PO04', 'PO05',
  'SC01', 'SC02', 'SC03', 'SC05', 'SC06'] as const;
export type NavigationScreen = (typeof NAVIGATION_SCREENS)[number];
export type NavigationAccessResponse = {
  userId: string;
  sessionId: string;
  tenantId: string;
  screenIds: NavigationScreen[];
  validUntil: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FIELDS = ['userId', 'sessionId', 'tenantId', 'screenIds', 'validUntil'];

export function navigationAccess(value: unknown): NavigationAccessResponse {
  const invalid = () => new InternalServerErrorException('INVALID_NAVIGATION');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== FIELDS.length || Object.keys(item).some((key) => !FIELDS.includes(key))) throw invalid();
  if (!['userId', 'sessionId', 'tenantId'].every((key) => typeof item[key] === 'string' && UUID.test(item[key] as string))) throw invalid();
  if (!Number.isSafeInteger(item.validUntil) || (item.validUntil as number) <= 0) throw invalid();
  const ids = item.screenIds;
  if (!Array.isArray(ids) || ids.length > NAVIGATION_SCREENS.length
    || ids.some((id: unknown) => !NAVIGATION_SCREENS.includes(id as NavigationScreen))
    || ids.some((id: string, i: number) => i > 0 && ids[i - 1] >= id)
    || ids.includes('OP04') !== ids.includes('OP05')
    || (ids.includes('OP02') && !ids.includes('OP01'))
    || (ids.includes('AC02') && !ids.includes('AC01'))
    || (ids.includes('AC04') && !ids.includes('AC03'))
    || (ids.includes('AC06') && !ids.includes('AC05'))
    || (ids.includes('AC08') && !ids.includes('AC07'))
    || (ids.includes('AS02') && !ids.includes('AS01'))
    || (ids.includes('AS03') && !ids.includes('AS01'))
    || (ids.includes('AS05') && !ids.includes('AS04'))
    || (ids.includes('AS07') && !ids.includes('AS06'))
    || (ids.includes('BL05') && !ids.includes('BL04'))
    || (ids.includes('BL07') && !ids.includes('BL06'))) throw invalid();
  return item as NavigationAccessResponse;
}
