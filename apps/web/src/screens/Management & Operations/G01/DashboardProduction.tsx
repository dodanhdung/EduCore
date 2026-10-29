import { useEffect, useRef, useState } from 'react'
import { ApiClient, ApiError, safeErrorMessage } from '../../../api.ts'
import { G01DashboardView } from './DashboardView.tsx'
import type { DashboardPresentation } from './DashboardView.tsx'
import { fromOverviewResponse, overviewPath } from './DashboardViewModel.ts'

export type OverviewReader = (tenantId: string, token: string, signal: AbortSignal) => Promise<unknown>
const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '')
const readOverview: OverviewReader = (tenantId, token, signal) => api.request<unknown>(overviewPath(tenantId),
  { accessToken: token, cache: 'no-store', signal })

function failure(cause: unknown): DashboardPresentation {
  const kind = cause instanceof ApiError ? cause.status === 401 ? 'unauthenticated' : cause.status === 403 ? 'forbidden'
    : cause.status === 404 ? 'not-found' : cause.status === 409 ? 'conflict'
      : cause.status >= 500 ? 'error' : 'unavailable' : 'error'
  return { kind, detail: safeErrorMessage(cause) }
}

/** AppView owns route/session authorization; this container owns only the scoped GET. */
export function DashboardProduction({ tenantId, token, onUnauthorized, loadOverview = readOverview }: {
  tenantId: string; token: string; onUnauthorized?: () => void; loadOverview?: OverviewReader
}) {
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; presentation: DashboardPresentation } | null>(null)
  const requestSequence = useRef(0)
  const unauthorized = useRef(onUnauthorized)
  useEffect(() => { unauthorized.current = onUnauthorized }, [onUnauthorized])
  const key = `${tenantId}\u0000${token}\u0000${revision}`
  useEffect(() => {
    const sequence = ++requestSequence.current
    const abort = new AbortController()
    void loadOverview(tenantId, token, abort.signal)
      .then(value => {
        if (abort.signal.aborted || sequence !== requestSequence.current) return
        const model = fromOverviewResponse(value, tenantId)
        setResult({ key, presentation: { kind: 'ready', model } })
      })
      .catch(cause => {
        if (abort.signal.aborted || sequence !== requestSequence.current) return
        const presentation = failure(cause)
        if (presentation.kind === 'unauthenticated') unauthorized.current?.()
        setResult({ key, presentation })
      })
    return () => { abort.abort() }
  }, [key, tenantId, token, loadOverview])
  const presentation: DashboardPresentation = result?.key === key ? result.presentation : { kind: 'loading' }
  return <div className="management" data-screen-id="G01"><G01DashboardView presentation={presentation.kind === 'error'
    ? { ...presentation, onRetry: () => setRevision(value => value + 1) } : presentation} /></div>
}
