import { InternalServerErrorException } from '@nestjs/common';

export const NAVIGATION_SCREENS = ['OP01', 'OP02', 'OP03', 'OP04', 'OP05', 'OP06', 'OP07'] as const;
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
    || (ids.includes('OP02') && !ids.includes('OP01'))) throw invalid();
  return item as NavigationAccessResponse;
}
