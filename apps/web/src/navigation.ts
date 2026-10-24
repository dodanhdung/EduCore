import { ApiClient, ApiError } from './api.ts'
import type { NavigationReader, NavigationResponse } from './auth.ts'

export const NAVIGATION_SCREENS = ['OP01', 'OP04', 'OP05', 'OP06', 'OP07'] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const FIELDS = ['userId', 'sessionId', 'tenantId', 'screenIds', 'validUntil']

export function navigationResponse(value: unknown): NavigationResponse {
  const invalid = () => new ApiError(502, 'INVALID_NAVIGATION')
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid()
  const item = value as Record<string, unknown>
  if (Object.keys(item).length !== FIELDS.length || Object.keys(item).some((key) => !FIELDS.includes(key))) throw invalid()
  if (!['userId', 'sessionId', 'tenantId'].every((key) => typeof item[key] === 'string' && UUID.test(item[key] as string))) throw invalid()
  if (!Number.isSafeInteger(item.validUntil) || (item.validUntil as number) <= 0) throw invalid()
  const ids = item.screenIds
  if (!Array.isArray(ids) || ids.length > NAVIGATION_SCREENS.length
    || ids.some((id: unknown) => !NAVIGATION_SCREENS.includes(id as typeof NAVIGATION_SCREENS[number]))
    || ids.some((id: string, i: number) => i > 0 && ids[i - 1] >= id)
    || ids.includes('OP04') !== ids.includes('OP05')) throw invalid()
  return item as NavigationResponse
}

export function createNavigationReader(api: ApiClient): NavigationReader {
  return async (token, tenantId) => {
    const value = navigationResponse(await api.navigation(token, tenantId))
    if (value.tenantId !== tenantId) throw new ApiError(502, 'INVALID_NAVIGATION')
    return value
  }
}
