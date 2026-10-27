// Local, synthetic production-bundle check. No CDP payload, credentials or profile is logged.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

const edge = process.env.PILOT_EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const web = process.env.PILOT_WEB_ORIGIN;
const api = process.env.PILOT_API_ORIGIN;
const email = process.env.PILOT_BROWSER_EMAIL;
const password = process.env.PILOT_BROWSER_PASSWORD;
const tenant = process.env.PILOT_BROWSER_TENANT;
const scenario = process.env.PILOT_BROWSER_SCENARIO ?? 'FINANCE_UI_SMOKE';
const auditUrl = process.env.PILOT_AUDIT_DB_URL;
if (!existsSync(edge) || !web || !api || !email?.endsWith('.invalid') || !password || !tenant) throw Error('BROWSER_TEST_CONFIG_REQUIRED');
if (!['CORE_UI_SMOKE', 'FINANCE_UI_SMOKE'].includes(scenario) || (scenario === 'FINANCE_UI_SMOKE' && !auditUrl)) throw Error('BROWSER_SCENARIO_CONFIG_REQUIRED');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, code, ms = 20_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const value = await check(); if (value) return value; } catch { /* startup */ } await delay(100); }
  throw Error(`BROWSER_TIMEOUT_${code}`);
}
const profile = await mkdtemp(join(tmpdir(), 'educore-built-web-'));
let child, ws;
const network = [];
const pending = new Map();
let id = 0;
try {
  child = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const [port, path] = await until(async () => (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'), 'DEBUGGER');
  ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', () => reject(Error('CDP_CONNECTION_FAILED')), { once: true }); });
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const waiter = pending.get(message.id); if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(Error('CDP_COMMAND_FAILED')); else waiter.resolve(message.result);
    } else if (message.method === 'Network.responseReceived') {
      const response = message.params.response;
      if (response.url.startsWith(`${api}/api/v1/`)) network.push({ path: new URL(response.url).pathname, status: response.status });
    }
  });
  function send(method, params = {}, sessionId) {
    const sequence = ++id;
    const promise = new Promise((resolve, reject) => pending.set(sequence, { resolve, reject }));
    ws.send(JSON.stringify({ id: sequence, method, params, ...(sessionId ? { sessionId } : {}) }));
    return promise;
  }
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async (expression) => {
    const value = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (value.exceptionDetails) throw Error('BROWSER_EVALUATION_FAILED');
    return value.result.value;
  };
  const clickRoute = (suffix) => evaluate(`document.querySelector('.sidebar a[href="/app/${tenant}/${suffix}"]')?.click()`);
  await send('Page.enable', {}, sessionId);
  await send('Network.enable', {}, sessionId);
  await send('Page.navigate', { url: `${web}/login` }, sessionId);
  await until(() => evaluate('!!document.querySelector("#login-email")'), 'LOGIN_FORM');
  await evaluate('document.getElementById("login-email").focus()');
  await send('Input.insertText', { text: email }, sessionId);
  await evaluate('document.getElementById("login-password").focus()');
  await send('Input.insertText', { text: password }, sessionId);
  await evaluate('document.querySelector("form").requestSubmit()');
  await until(() => evaluate('location.pathname === "/select-tenant" && !!document.querySelector(".ec-tenant-choice")'), 'TENANT_SELECTION');
  await evaluate('document.querySelector(".ec-tenant-choice").click()');
  await until(() => evaluate(`location.pathname.startsWith('/app/${tenant}/') && !!document.querySelector('.app-shell')`), 'AUTHORIZED_LANDING');
  const dashboardLink = await evaluate(`!!document.querySelector('.sidebar a[href="/app/${tenant}/overview"]')`);
  if (!dashboardLink) throw Error('DASHBOARD_NAVIGATION_UNAVAILABLE');
  await clickRoute('overview');
  await until(() => evaluate(`location.pathname === '/app/${tenant}/overview' && document.querySelectorAll('.mo-metric').length === 3`), 'THREE_DASHBOARD_KPIS');
  const kpis = await evaluate(`Array.from(document.querySelectorAll('.mo-metric strong')).map(e => e.textContent.trim())`);
  if (kpis.some((value) => !value)) throw Error('DASHBOARD_KPI_EMPTY');
  if (!await evaluate(`!!document.querySelector('.sidebar a[href="/app/${tenant}/students"]')`)) throw Error('ACADEMIC_NAVIGATION_UNAVAILABLE');
  await clickRoute('students');
  await until(() => evaluate(`location.pathname === '/app/${tenant}/students' && !!document.querySelector('[data-screen-id="AC01"] .academic-table-scroll')`), 'ACADEMIC_DATA');
  if (!network.some((entry) => entry.path.endsWith('/academic/students') && entry.status === 200)) throw Error('ACADEMIC_API_MISSING');
  let topUp = 'NOT_RUN';
  let financePersistence = null;
  if (scenario === 'FINANCE_UI_SMOKE') {
    if (!await evaluate(`!!document.querySelector('.sidebar a[href="/app/${tenant}/finance/receivables"]')`)) throw Error('BL09_NAVIGATION_UNAVAILABLE');
    await clickRoute('finance/receivables');
    await until(() => evaluate(`location.pathname === '/app/${tenant}/finance/receivables' && !!document.querySelector('[data-screen-id="BL09"] select[aria-label]')`), 'BL09_DATA');
    if (!network.some((entry) => entry.path.includes('/finance/students') && entry.status === 200)) throw Error('FINANCE_API_MISSING');
    if (!await evaluate('!!document.querySelector(".billing-form-grid")')) throw Error('TOP_UP_FORM_UNAVAILABLE');
    const studentId = await evaluate('document.querySelector("[data-screen-id=BL09] select[aria-label]").value');
    if (!/^[0-9a-f-]{36}$/i.test(studentId)) throw Error('TOP_UP_STUDENT_INVALID');
    const financialState = async () => {
      const sql = postgres(auditUrl, { max: 1 });
      try {
        const [row] = await sql`SELECT
          (SELECT count(*)::int FROM public.wallet_transactions t JOIN public.wallet_accounts a ON a.id=t.wallet_id
            WHERE a.tenant_id=${tenant}::uuid AND a.student_id=${studentId}::uuid AND t.kind='TOP_UP') topups,
          (SELECT count(*)::int FROM public.payments WHERE tenant_id=${tenant}::uuid) invoice_payments,
          (SELECT balance_vnd::text FROM public.wallet_accounts WHERE tenant_id=${tenant}::uuid AND student_id=${studentId}::uuid) balance`;
        return row;
      } finally { await sql.end(); }
    };
    const before = await financialState();
    const values = ['1000', `PILOT-${randomUUID()}`, 'Synthetic receipt verified locally', 'Controlled pilot browser smoke'];
    const fields = await evaluate('Array.from(document.querySelectorAll(".billing-form-grid input:not([type=checkbox])")).length');
    if (fields !== 4) throw Error('TOP_UP_FORM_SHAPE_MISMATCH');
    for (let index = 0; index < 4; index++) {
      await evaluate(`document.querySelectorAll('.billing-form-grid input:not([type=checkbox])')[${index}].focus()`);
      await send('Input.insertText', { text: values[index] }, sessionId);
    }
    await evaluate('document.querySelector(".billing-form-grid input[type=checkbox]").click()');
    const enabled = await evaluate('Array.from(document.querySelectorAll("[data-screen-id=BL09] button")).some(b => b.textContent.includes("TOP_UP") && !b.disabled)');
    if (!enabled) throw Error('TOP_UP_SUBMIT_DISABLED');
    await evaluate('Array.from(document.querySelectorAll("[data-screen-id=BL09] button")).find(b => b.textContent.includes("TOP_UP") && !b.disabled).click()');
    await until(() => network.some((entry) => entry.path.endsWith('/wallet/top-ups') && entry.status === 200), 'TOP_UP_HTTP');
    await until(() => evaluate('document.querySelector("[data-screen-id=BL09]")?.textContent.includes("PILOT-")'), 'TOP_UP_WALLET_HISTORY');
    const after = await financialState();
    if (after.balance === null || after.topups !== before.topups + 1 || after.invoice_payments !== before.invoice_payments ||
        BigInt(after.balance) !== BigInt(before.balance ?? '0') + 1000n) throw Error('TOP_UP_PERSISTENCE_MISMATCH');
    topUp = 'PASS_UI_HTTP_200_WALLET_HISTORY';
    financePersistence = { topUpsBefore: before.topups, topUpsAfter: after.topups,
      invoicePaymentsAdded: 0, walletBalanceBeforeVnd: before.balance ?? '0',
      walletBalanceAfterVnd: after.balance, walletBalanceDeltaVnd: '1000' };
  }
  await evaluate('document.querySelector(".top-actions button").click()');
  await until(() => evaluate('location.pathname === "/login" && !document.querySelector(".app-shell")'), 'LOGOUT');
  await send('Page.navigate', { url: `${web}/app/${tenant}/overview` }, sessionId);
  await until(() => evaluate('!document.querySelector(".app-shell")'), 'PROTECTED_AFTER_LOGOUT');
  const required = ['/api/v1/auth/login', '/api/v1/auth/select-tenant', `/api/v1/tenants/${tenant}/portal/overview`, '/api/v1/auth/logout'];
  if (!required.every((path) => network.some((entry) => entry.path === path && entry.status === (path.endsWith('/logout') ? 204 : 200)))) throw Error('BROWSER_HTTP_SEQUENCE_MISMATCH');
  process.stdout.write(JSON.stringify({ result: 'PASS', scenario, builtWeb: true, realApi: true, role: 'Manager', login: 200,
    selectTenant: 200, dashboardKpis: kpis.length, dashboardApi: 200, academicScreen: 'AC01', academicApi: 200,
    financeScreen: scenario === 'FINANCE_UI_SMOKE' ? 'BL09' : 'NOT_RUN', financeApi: scenario === 'FINANCE_UI_SMOKE' ? 200 : 'NOT_RUN',
    topUp, financePersistence, logout: 204, protectedAfterLogout: 'DENIED' }) + '\n');
} catch (error) {
  process.stderr.write(`BUILT_WEB_BROWSER_${error instanceof Error ? error.message.replace(/[^A-Z0-9_]/g, '_') : 'FAILED'}\n`);
  process.exitCode = 1;
} finally {
  if (ws?.readyState === WebSocket.OPEN) ws.close();
  if (child && child.exitCode === null) child.kill();
}
