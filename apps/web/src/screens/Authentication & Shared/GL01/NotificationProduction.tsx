import { useEffect, useState } from 'react'
import { ApiClient, ApiError, safeErrorMessage } from '../../../api.ts'

type Notice = { id: string; kind: string; title: string; body: string; readAt: string | null; createdAt: string }
type Page = { items: Notice[]; page: number; pageSize: number; total: number; timezone: string }
type State = 'loading' | 'ready' | 'forbidden' | 'unauthenticated' | 'error'
const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '')

export function NotificationProduction({ tenantId, token }: { tenantId: string; token: string }) {
  const [page, setPage] = useState(1)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<Page | null>(null)
  const [unread, setUnread] = useState<number | null>(null)
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const abort = new AbortController()
    Promise.all([
      api.learning<Page>(tenantId, `/notifications?page=${page}&unreadOnly=${unreadOnly}`, token, { signal: abort.signal }),
      api.learning<{ count: number }>(tenantId, '/notifications/unread-count', token, { signal: abort.signal }),
    ]).then(([list, count]) => {
      if (!abort.signal.aborted) { setData(list); setUnread(count.count); setState('ready') }
    }).catch((error: unknown) => {
      if (!abort.signal.aborted) setState(error instanceof ApiError && error.status === 401 ? 'unauthenticated'
        : error instanceof ApiError && error.status === 403 ? 'forbidden' : 'error')
    })
    return () => abort.abort()
  }, [tenantId, token, page, unreadOnly, revision])
  async function markRead(id: string) {
    setBusy(id); setMessage('')
    try {
      const result = await api.learning<{ id: string; read: boolean }>(tenantId, `/notifications/${encodeURIComponent(id)}/read`, token, { method: 'POST' })
      if (result.id !== id || result.read !== true) throw new ApiError(502, 'INVALID_RESPONSE')
      setMessage('Đã đánh dấu đã đọc.'); setRevision((value) => value + 1)
    } catch (error) { setMessage(safeErrorMessage(error)) }
    finally { setBusy(null) }
  }
  const format = (at: string) => data ? new Intl.DateTimeFormat('vi-VN', { timeZone: data.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(at)) : at
  return <section className="ec-content-page" data-screen-id="GL01">
    <span className="ec-route-tag">GL01 · Thông báo</span>
    <div className="ec-profile-heading"><div><h1>Thông báo</h1><p>Thông báo trong phạm vi tài khoản và trung tâm hiện tại.</p></div>
      <div className="ec-filter-tabs" role="group" aria-label="Lọc thông báo">
        <button aria-pressed={!unreadOnly} onClick={() => { setUnreadOnly(false); setPage(1) }}>Tất cả</button>
        <button aria-pressed={unreadOnly} onClick={() => { setUnreadOnly(true); setPage(1) }}>Chưa đọc{unread === null ? '' : ` (${unread})`}</button>
      </div></div>
    {state === 'loading' && <p role="status">Đang tải thông báo…</p>}
    {state === 'unauthenticated' && <p role="alert">Phiên đã hết hạn. Vui lòng đăng nhập lại.</p>}
    {state === 'forbidden' && <p role="alert">Bạn không có quyền xem thông báo.</p>}
    {state === 'error' && <p role="alert">Không tải được thông báo. <button onClick={() => setRevision((value) => value + 1)}>Thử lại</button></p>}
    {message && <p role="status">{message}</p>}
    {state === 'ready' && data && <>
      {data.items.length ? <div className="ec-notice-list">{data.items.map((item) => <article key={item.id} className="ec-notice-card">
        <h2>{item.title}</h2><p>{item.body}</p><p>{item.kind} · {item.readAt ? 'Đã đọc' : 'Chưa đọc'}</p>
        <time dateTime={item.createdAt}>{format(item.createdAt)} · {data.timezone}</time>
        {!item.readAt && <button disabled={busy !== null} onClick={() => void markRead(item.id)}>{busy === item.id ? 'Đang lưu…' : 'Đánh dấu đã đọc'}</button>}
      </article>)}</div> : <p role="status">Chưa có thông báo trong phạm vi này.</p>}
      <nav className="mo-actions" aria-label="Trang thông báo"><button disabled={page <= 1 || busy !== null} onClick={() => setPage(page - 1)}>Trước</button>
        <span>Trang {page} · {data.total} thông báo</span><button disabled={page * data.pageSize >= data.total || busy !== null} onClick={() => setPage(page + 1)}>Sau</button></nav>
    </>}
  </section>
}
