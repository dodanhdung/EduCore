import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { matchRoute, routes } from '../../routes.ts'
import { canView, resolveRoute } from '../../auth.ts'
import { managementIds, retryEligible, roleValidation, money } from './ManagementTypes.ts'

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/__ui-preview/G01' })
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(async () => { await vite.close(); dom.window.close() })
const { ManagementScreen } = await vite.ssrLoadModule('/src/screens/Management & Operations/ManagementScreens.tsx')
const { managementFixtures: data, managementScenario } = await vite.ssrLoadModule('/src/ui-preview/managementFixtures.ts')
const { PreviewApp } = await vite.ssrLoadModule('/src/ui-preview/PreviewApp.tsx')
const { AppView } = await vite.ssrLoadModule('/src/App.tsx')
const base = { preview: true, data, tenantId: data.tenantId, canReview: true }
const props = (id, extra = {}) => ({ ...base, id, selectedId: id === 'OP02' ? 'MB-031' : id === 'OP05' ? 'YC-24018' : undefined, ...extra })
const html = (id, extra) => renderToStaticMarkup(React.createElement(ManagementScreen, props(id, extra)))
const suffixes = ['/overview', '/settings/members', '/settings/members/MB-031', '/relationships', '/approvals', '/approvals/YC-24018', '/audit', '/operations/jobs']
const session = { accessToken: 'TEST', csrfToken: 'TEST', expiresAt: Date.now() + 3600000, tenantEpoch: 1, principal: { id: 'user', sessionId: 'session', tenantId: data.tenantId, allowedTenants: [{ id: data.tenantId, name: data.tenantName }] } }
const state = { status: 'authenticated', session }
function doc(source) { return new JSDOM(source).window.document }
async function mounted(id, extra, run) {
  const root = createRoot(document.getElementById('root'))
  const render = async (patch = {}) => act(async () => root.render(React.createElement(ManagementScreen, props(id, { ...extra, ...patch }))))
  try { await render(); await run(document, render) } finally { await act(async () => root.unmount()) }
}
const click = async (element) => { assert.ok(element); await act(async () => element.click()) }
const button = (label) => [...document.querySelectorAll('button')].find((el) => el.textContent === label)
const changeSelect = async (element, value) => act(async () => { element.value = value; element.dispatchEvent(new window.Event('change', { bubbles: true })) })
async function input(element, value) { await act(async () => { const prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value); element.dispatchEvent(new window.Event('input', { bubbles: true })) }) }

test('G01–OP07 canonical routes have no duplicates and auth evidence remains mandatory', () => {
  managementIds.forEach((id, i) => {
    const path = `/app/${data.tenantId}${suffixes[i]}`, route = routes.find((r) => r.id === id)
    assert.equal(matchRoute(path)?.route.id, id); assert.equal(routes.filter((r) => r.id === id).length, 1)
    assert.equal(resolveRoute(path, { status: 'unauthenticated' }).kind, 'unauthenticated')
    assert.equal(resolveRoute(path, state).kind, 'forbidden')
    assert.equal(canView(route, session, 'other', { tenantId: 'other', screenIds: [id] }), false)
    assert.equal(canView(route, { ...session, expiresAt: 0 }, data.tenantId, { tenantId: data.tenantId, screenIds: [id] }), false)
    const view = renderToStaticMarkup(React.createElement(AppView, { state, path, navigate() {}, onLogout() {} }))
    assert.doesNotMatch(view, /yen.le@educore.vn|84500000|YC-24018/)
  })
})
test('all eight screens mount in actual PreviewApp, selecting explicit detail IDs', () => {
  for (const id of managementIds) {
    window.history.replaceState({}, '', `/__ui-preview/${id}`)
    const source = renderToStaticMarkup(React.createElement(PreviewApp, { screenId: id }))
    assert.match(source, /Dữ liệu mẫu — UI Preview/); assert.match(source, new RegExp(`data-screen-id="${id}"`))
  }
  window.history.replaceState({}, '', '/__ui-preview/OP02?recordId=MB-002')
  assert.match(renderToStaticMarkup(React.createElement(PreviewApp, { screenId: 'OP02' })), /Trần Minh Khoa/)
  window.history.replaceState({}, '', '/__ui-preview/OP05?recordId=unknown')
  assert.match(renderToStaticMarkup(React.createElement(PreviewApp, { screenId: 'OP05' })), /Không tìm thấy/)
})
test('production mode and tenant mismatch suppress all fixtures and actions', () => {
  for (const id of managementIds) {
    assert.match(html(id, { preview: false }), /Chờ kết nối quyền/)
    assert.doesNotMatch(html(id, { preview: false }), /YC-24018|yen.le|MB-031|Tạo tài khoản/)
    assert.match(html(id, { tenantId: 'other' }), /Không có quyền/)
  }
  const poisoned = { ...data, members: [...data.members, { ...data.members[0], id: 'alien', tenantId: 'other', name: 'CROSS_TENANT_SECRET' }] }
  assert.doesNotMatch(html('OP01', { data: poisoned }), /CROSS_TENANT_SECRET/)
})
test('loading/401/403/404/409/422/network states never show underlying records', () => {
  for (const id of managementIds) for (const state of ['loading', 'unauthenticated', 'forbidden', 'not-found', 'conflict', 'invalid', 'error']) {
    const source = html(id, { state }); assert.doesNotMatch(source, /MB-031|YC-24018|JB-2417|yen.le@/)
    assert.match(source, /role="(?:status|alert)"/)
  }
})
test('G01 has exactly three KPIs; zero versus unavailable and BigInt money remain distinct', () => {
  assert.equal(doc(html('G01')).querySelectorAll('.mo-metric').length, 3)
  assert.match(html('G01'), /1\.248/); assert.match(html('G01'), /84\.500\.000 ₫/)
  assert.match(html('G01', managementScenario('empty')), /0 ₫/)
  assert.match(html('G01', managementScenario('partial')), /Chưa có quyền xem/)
  assert.equal(money('9007199254740993'), '9.007.199.254.740.993 ₫')
  assert.equal(doc(html('G01')).querySelectorAll('.mo-metric button').length, 0)
})
test('OP01 filters pending activation, handles empty search and opens exact membership', async () => {
  const opened = []
  await mounted('OP01', { open: (...args) => opened.push(args) }, async () => {
    await changeSelect(document.querySelector('select'), 'PENDING_ACTIVATION')
    assert.match(document.querySelector('tbody').textContent, /Lê Hoàng Yến/); assert.doesNotMatch(document.querySelector('tbody').textContent, /Nguyễn Văn An/)
    await click(button('Xem chi tiết')); assert.deepEqual(opened, [['OP02', 'MB-031']])
    await input(document.querySelector('[type=search]'), 'no-such-person'); assert.match(document.body.textContent, /Không có kết quả/)
  })
})
test('member create validates inputs, reviews only, and restores focus on Escape', async () => {
  await mounted('OP01', {}, async () => {
    const before = data.members.length
    await click(button('Tạo tài khoản')); await click(button('Xem lại yêu cầu'))
    assert.match(document.querySelector('dialog').textContent, /Nhập họ và tên/)
    const fields = document.querySelectorAll('dialog input')
    await input(fields[0], 'Nguyễn Test'); await input(fields[1], 'invalid'); await input(document.querySelector('dialog textarea'), 'Tạo tài khoản để kiểm tra')
    await click(button('Xem lại yêu cầu')); assert.match(document.querySelector('dialog').textContent, /Email chưa hợp lệ/)
    await input(fields[1], 'test@example.test'); await click(button('Xem lại yêu cầu'))
    assert.match(document.querySelector('.mo-review').textContent, /Chưa thực hiện thay đổi/); assert.equal(button('Gửi yêu cầu chưa khả dụng').disabled, true); assert.equal(data.members.length, before)
    await act(async () => document.querySelector('dialog').dispatchEvent(new window.Event('cancel', { bubbles: true, cancelable: true })))
    assert.equal(document.querySelector('dialog'), null); assert.equal(document.activeElement.textContent, 'Tạo tài khoản')
  })
})
test('OP02 validates seeded roles, scoped IDs and already-effective assignments', () => {
  const assignments = data.members[2].assignments
  assert.match(roleValidation({ role: 'Teacher', scope: 'CLASS', reason: 'x' }, assignments), /mã lớp/)
  assert.match(roleValidation({ role: 'Teacher', scope: 'CLASS', scopeId: 'IELTS-03', reason: 'x' }, assignments), /đã có hiệu lực/)
  assert.equal(roleValidation({ role: 'Academic Staff', scope: 'STUDENT', scopeId: 'ST-1028', reason: 'x' }, assignments), undefined)
  assert.match(html('OP02'), /Đã thu hồi/)
  const manager = doc(html('OP02', { selectedId: 'MB-001' })); const actions = [...manager.querySelectorAll('button')]
  assert.equal(actions.find((el) => el.textContent === 'Khóa tài khoản').disabled, true)
  assert.equal(actions.find((el) => el.textContent === 'Thu hồi Manager').disabled, true)
})
test('OP02 role assignment form requires scope then prepares a review without changes', async () => {
  await mounted('OP02', {}, async () => {
    await click(button('Gán role')); const selects = document.querySelectorAll('dialog select')
    await changeSelect(selects[0], 'Teacher'); await changeSelect(selects[1], 'STUDENT'); await input(document.querySelector('dialog textarea'), 'Phân công theo học sinh')
    await click(button('Xem lại yêu cầu')); assert.match(document.querySelector('dialog').textContent, /mã lớp hoặc học sinh/)
    await input(document.querySelector('dialog input'), 'ST-2000'); await click(button('Xem lại yêu cầu')); assert.ok(document.querySelector('.mo-review'))
    assert.equal(data.members[2].assignments.length, 2)
  })
})
test('OP03 pending/verified/revoked distinct; only valid states offer review actions', () => {
  const table = doc(html('OP03')).querySelector('table')
  assert.match(table.textContent, /Chờ xác minh/); assert.match(table.textContent, /Đang hiệu lực/); assert.match(table.textContent, /Đã thu hồi/)
  const revoked = [...table.querySelectorAll('tr')].find((r) => r.textContent.includes('Phạm Minh Tuấn'))
  assert.equal(revoked.querySelectorAll('button').length, 0)
  assert.doesNotMatch(html('OP03', { canReview: false }), /Chuẩn bị liên kết|<button[^>]*>Xác minh/)
})
test('OP04 filters by decision and failed execution without changing decision status', async () => {
  await mounted('OP04', managementScenario('failed'), async () => {
    await click(button('Thực thi thất bại'))
    assert.match(document.querySelector('tbody').textContent, /YC-24018/)
    assert.match(document.querySelector('tbody').textContent, /Đã duyệt · chờ thực thi/)
    assert.doesNotMatch(document.querySelector('tbody').textContent, /Đã hoàn thành/)
  })
})
test('OP05 decision and execution are separate; no completion from failed/stale evidence', () => {
  const pending = doc(html('OP05')); assert.ok([...pending.querySelectorAll('button')].some((b) => b.textContent === 'Phê duyệt')); assert.doesNotMatch(pending.body.textContent, /Xem lại thực thi/)
  const approved = html('OP05', managementScenario('approved')); assert.match(approved, /Xem lại thực thi/); assert.doesNotMatch(approved, />Phê duyệt<|Đã hoàn thành theo bằng chứng/)
  assert.match(html('OP05', managementScenario('failed')), /Thực thi thất bại/)
  assert.match(html('OP05', managementScenario('self-approved')), /SELF_APPROVED · Cờ tự phê duyệt/)
  const missing = structuredClone(data); missing.approvals[3].receipt = undefined
  assert.match(html('OP05', { data: missing, selectedId: 'YC-24015' }), /Chưa đủ bằng chứng/)
  assert.doesNotMatch(html('OP05', { data: missing, selectedId: 'YC-24015' }), /Đã hoàn thành theo bằng chứng/)
  assert.match(html('OP05', { selectedId: 'YC-24015' }), /Đã hoàn thành theo bằng chứng mẫu/)
})
test('OP05 approve form requires reason and cannot transition local workflow', async () => {
  await mounted('OP05', {}, async () => {
    await click(button('Phê duyệt')); await click(button('Xem lại yêu cầu')); assert.match(document.querySelector('dialog').textContent, /Nhập lý do/)
    await input(document.querySelector('textarea'), 'Đã đối chiếu biên bản'); await click(button('Xem lại yêu cầu'))
    assert.match(document.querySelector('.mo-review').textContent, /Chưa thực hiện thay đổi/)
    assert.equal(data.approvals[0].status, 'PENDING_APPROVAL')
  })
})
test('OP06 allowlists displayed audit fields and remains read-only with timeline details', async () => {
  const poisoned = { ...data, audit: data.audit.map((a) => ({ ...a, password: 'SECRET_PASSWORD', otp: 'SECRET_OTP', token: 'SECRET_TOKEN', payload: { private: 'SECRET_PAYLOAD' } })) }
  assert.doesNotMatch(html('OP06', { data: poisoned }), /SECRET_/)
  await mounted('OP06', { data: poisoned }, async () => {
    await click(button('Xem sự kiện')); assert.match(document.body.textContent, /Chuỗi xử lý/)
    assert.doesNotMatch(document.body.textContent, /SECRET_/)
    assert.equal(document.querySelectorAll('dialog, textarea, [contenteditable=true]').length, 0)
    assert.match(document.body.textContent, /24 tháng/)
  })
})
test('audit filters actor and tenant-local dates, validates reversed date range', async () => {
  await mounted('OP06', {}, async () => {
    await changeSelect(document.querySelectorAll('select')[1], 'Lê Hoàng Yến')
    assert.equal(document.querySelectorAll('tbody tr').length, 1)
    const dates = document.querySelectorAll('[type=date]')
    await input(dates[0], '2026-10-24'); assert.match(document.body.textContent, /Không có kết quả/)
    await input(dates[1], '2026-10-23'); assert.match(document.body.textContent, /Ngày kết thúc phải/)
    assert.equal(dates[0].getAttribute('aria-invalid'), 'true')
  })
})
test('OP07 retry checks status, attempts and effect receipts; exhaustion unavailable', async () => {
  assert.equal(retryEligible(data.jobs[0]), true); assert.equal(retryEligible(data.jobs[3]), true)
  for (const j of [data.jobs[1], data.jobs[2], data.jobs[4], data.jobs[5], data.jobs[6], { ...data.jobs[0], hasEffectReceipt: true }]) assert.equal(retryEligible(j), false)
  await mounted('OP07', {}, async () => {
    await click([...document.querySelectorAll('tr')].find((r) => r.textContent.includes('JB-2417')).querySelector('button'))
    assert.ok(button('Xem lại yêu cầu retry'))
    await click([...document.querySelectorAll('tr')].find((r) => r.textContent.includes('JB-2413')).querySelector('button'))
    assert.equal(button('Xem lại yêu cầu retry'), undefined); assert.match(document.body.textContent, /Đã hết lượt/)
  })
})
test('revoked review permission and tenant switch remove open dialog and sensitive state', async () => {
  await mounted('OP02', {}, async (_, render) => {
    await click(button('Gán role')); assert.ok(document.querySelector('dialog'))
    await render({ canReview: false }); assert.equal(document.querySelector('dialog'), null)
    assert.equal(button('Gán role'), undefined)
    await render({ tenantId: 'other' }); assert.doesNotMatch(document.body.textContent, /yen.le@|MB-031/)
  })
})
test('review dialog traps keyboard focus and links form errors to fields', async () => {
  await mounted('OP01', {}, async () => {
    await click(button('Tạo tài khoản')); await click(button('Xem lại yêu cầu'))
    const dialog = document.querySelector('dialog'), first = dialog.querySelector('input'), last = dialog.querySelector('button[type=submit]')
    assert.ok(document.getElementById(first.getAttribute('aria-describedby')))
    await act(async () => { last.focus(); last.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })) })
    assert.equal(document.activeElement, first)
    await act(async () => first.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })))
    assert.equal(document.activeElement, last)
  })
})
test('semantic controls have labels; table captions, mobile rules and local SVG dimensions exist', () => {
  for (const id of managementIds) {
    const document = doc(html(id))
    for (const field of document.querySelectorAll('input,select,textarea')) assert.ok(field.closest('label'))
    for (const table of document.querySelectorAll('table')) assert.ok(table.querySelector('caption'))
  }
  const css = readFileSync(new URL('./management.css', import.meta.url), 'utf8')
  assert.match(css, /@media \(max-width: 768px\)/); assert.match(css, /focus-visible/); assert.match(css, /overflow-wrap: anywhere/)
  for (const name of ['active-students', 'active-classes', 'receivables']) {
    const svg = readFileSync(new URL(`./assets/${name}.svg`, import.meta.url), 'utf8'); assert.match(svg, /<svg[^>]*width="/); assert.match(svg, /<svg[^>]*height="/)
  }
})
test('DEV-only entry and available production bundles exclude Preview fixtures', () => {
  const main = readFileSync(new URL('../../main.tsx', import.meta.url), 'utf8'); assert.match(main, /if \(import.meta.env.DEV\)/)
  const screen = readFileSync(new URL('./ManagementScreens.tsx', import.meta.url), 'utf8'); assert.doesNotMatch(screen, /import.*managementFixtures/)
  const assets = new URL('../../../dist/assets/', import.meta.url)
  // Fresh checkouts can run unit tests before build. Bundle assertion runs when dist exists.
  if (!existsSync(assets)) return
  const content = readdirSync(assets).filter((name) => name.endsWith('.js')).map((name) => readFileSync(new URL(name, assets), 'utf8')).join('\n')
  assert.doesNotMatch(content, /yen.le@educore.vn|billing-root-2417|RCPT-238|PREVIEW_ONLY|Nguyễn Test/)
})
