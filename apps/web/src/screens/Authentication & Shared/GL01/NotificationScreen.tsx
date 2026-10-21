import { useState } from 'react'
import '../BatchPrimitives.tsx'

type NotificationItem = { id: string; title: string; body: string; createdAt: string; read: boolean }

export function NotificationScreen({ items = [] }: { items?: NotificationItem[] }) {
  const [unreadOnly, setUnreadOnly] = useState(false)
  const visibleItems = items.filter((item) => !unreadOnly || !item.read)

  return <section className="ec-content-page">
    <span className="ec-route-tag">GL01 · Thông báo</span>
    <div className="ec-profile-heading">
      <div><h1>Thông báo</h1><p>Các cập nhật dành cho tài khoản của bạn.</p></div>
      <div className="ec-filter-tabs" role="group" aria-label="Lọc thông báo">
        <button aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>Tất cả</button>
        <button aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>Chưa đọc</button>
      </div>
    </div>
    {visibleItems.length ? <div className="ec-notice-list">{visibleItems.map((item) => <article key={item.id} className="ec-notice-card">
      <h2>{item.title}</h2><p>{item.body}</p><time>{new Date(item.createdAt).toLocaleString('vi-VN')}</time>
    </article>)}</div> : <div className="ec-empty-notices">
      <span aria-hidden="true">♧</span><h2>Chưa có thông báo</h2>
      <p>Thông báo mới sẽ xuất hiện tại đây.</p>
      <small>PENDING_API · Chưa có nguồn dữ liệu thông báo.</small>
    </div>}
  </section>
}
