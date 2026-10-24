import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { Test } from '@nestjs/testing';
import { R4Module, configureR4Http } from '../../src/identity-access/r4.module.js';
import { R4Repository } from '../../src/identity-access/r4-repository.js';
import type { AuthConfig } from '../../src/identity-access/auth.service.js';
import { UnavailableOtpDelivery } from '../../src/identity-access/otp-delivery.js';

export const edgePath = process.env.R7_TEST_EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export const browserAvailable = existsSync(edgePath);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(check: () => Promise<T>, label: string): Promise<T> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw Error(`BROWSER_TIMEOUT_${label}`);
}

// Test-only CDP transport: never log credentials, headers, cookie values,
// tokens, DOM contents or debugger payloads. All commands stay in memory.
async function cdp(url: string) {
  const ws = new WebSocket(url);
  const waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const observers = new Set<(event: { method?: string; params?: unknown }) => void>();
  let sequence = 0;
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(Error('CDP_CONNECTION_FAILED')), { once: true });
  });
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: unknown; method?: string; params?: unknown };
    if (!message.id) { observers.forEach((observer) => observer(message)); return; }
    const pending = waiting.get(message.id);
    if (!pending) return;
    waiting.delete(message.id);
    if (message.error) pending.reject(Error('CDP_COMMAND_FAILED'));
    else pending.resolve(message.result);
  });
  ws.addEventListener('close', () => {
    for (const pending of waiting.values()) pending.reject(Error('CDP_CLOSED'));
    waiting.clear();
  });
  const send = <T = unknown>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> => {
    const id = ++sequence;
    const promise = new Promise<unknown>((resolve, reject) => { waiting.set(id, { resolve, reject }); });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return promise as Promise<T>;
  };
  return { send, onEvent: (observer: (event: { method?: string; params?: unknown }) => void) => { observers.add(observer); }, close: () => ws.close() };
}

export async function browserAuthJourney(options: {
  authUrl: string; apiUrl: string; config: AuthConfig; email: string; password: string; tenantId: string;
}) {
  if (!browserAvailable) throw Error('EDGE_TEST_ENVIRONMENT_UNAVAILABLE');
  if (process.env.R4_TEST_DISPOSABLE !== 'I_OWN_THIS_DISPOSABLE_CLUSTER') throw Error('DISPOSABLE_REQUIRED');
  const repository = new R4Repository(options.authUrl, options.apiUrl);
  await repository.assertRuntime();
  const origin = 'http://localhost:5173';
  const config = { ...options.config, production: false, origins: [origin] };
  const module = await Test.createTestingModule({ imports: [R4Module.register(repository, config, new UnavailableOtpDelivery())] }).compile();
  const app = module.createNestApplication();
  configureR4Http(app, config);
  const webRoot = fileURLToPath(new URL('../../../web/', import.meta.url));
  const webRequire = createRequire(join(webRoot, 'package.json'));
  type WebServer = { listen: () => Promise<unknown>; close: () => Promise<void> };
  const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href) as { createServer: (config: unknown) => Promise<WebServer> };
  let vite: WebServer | undefined;
  let browser: ReturnType<typeof spawn> | undefined;
  let protocol: Awaited<ReturnType<typeof cdp>> | undefined;
  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    const apiOrigin = `http://localhost:${address.port}`;
    vite = await createServer({ root: webRoot, logLevel: 'silent',
      server: { host: 'localhost', port: 5173, strictPort: true, hmr: false },
      define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiOrigin) } });
    await vite.listen();
    const servedApp = await (await fetch(`${origin}/src/App.tsx`)).text();
    if (!servedApp.includes(apiOrigin)) throw Error('BROWSER_TEST_API_ORIGIN_NOT_INJECTED');
    const profile = await mkdtemp(join(tmpdir(), 'educore-auth-browser-'));
    browser = spawn(edgePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-component-update', '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    const debuggerPort = await until(async () => {
      try { return (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n'); }
      catch { return false; }
    }, 'DEBUGGER');
    protocol = await cdp(`ws://127.0.0.1:${debuggerPort[0]}${debuggerPort[1]}`);
    const { targetId } = await protocol.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await protocol.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
    const send = protocol.send;
    const network: Record<string, unknown>[] = [];
    protocol.onEvent((event) => {
      if (event.method === 'Network.loadingFailed') {
        const failed = event.params as { errorText?: string; blockedReason?: string; corsErrorStatus?: { corsError?: string } };
        network.push({ networkError: failed.errorText, blockedReason: failed.blockedReason, corsError: failed.corsErrorStatus?.corsError });
        return;
      }
      if (event.method !== 'Network.responseReceived') return;
      const { response } = event.params as { response: { url: string; status: number } };
      const url = new URL(response.url);
      if (['/api/v1/auth/login', '/api/v1/auth/me', '/api/v1/auth/select-tenant', '/api/v1/auth/logout'].includes(url.pathname)
        || url.pathname.endsWith('/access/navigation')) {
        network.push({ path: url.pathname, status: response.status, expectedApiOrigin: url.origin === apiOrigin });
      }
    });
    const evaluate = async <T>(expression: string): Promise<T> => {
      const response = await send<{ result: { value: T }; exceptionDetails?: unknown }>('Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (response.exceptionDetails) throw Error('BROWSER_EVALUATION_FAILED');
      return response.result.value;
    };
    await send('Page.enable', {}, sessionId);
    await send('Network.enable', {}, sessionId);
    await send('Page.navigate', { url: `${origin}/login` }, sessionId);
    const login = async () => {
      await until(() => evaluate<boolean>('!!document.querySelector("#login-email")'), 'LOGIN_FORM');
      await evaluate('document.getElementById("login-email").focus()');
      await send('Input.insertText', { text: options.email }, sessionId);
      await evaluate('document.getElementById("login-password").focus()');
      await send('Input.insertText', { text: options.password }, sessionId);
      await evaluate('document.querySelector("form").requestSubmit()');
      try {
        await until(() => evaluate<boolean>('location.pathname === "/select-tenant" && document.querySelectorAll(".ec-tenant-choice").length === 1'), 'TENANT_SELECTION');
      } catch {
        const form = await evaluate('({emailInvalid: document.querySelector("#login-email")?.getAttribute("aria-invalid"), passwordInvalid: document.querySelector("#login-password")?.getAttribute("aria-invalid"), hasAlert: !!document.querySelector("[role=alert]"), tenantCount: document.querySelectorAll(".ec-tenant-choice").length, abortAny: typeof AbortSignal.any, abortTimeout: typeof AbortSignal.timeout})');
        throw Error('BROWSER_AUTH_HANDOFF_FAILED ' + JSON.stringify({ form, network }));
      }
      await evaluate('document.querySelector(".ec-tenant-choice").click()');
      await until(() => evaluate<boolean>(`location.pathname === ${JSON.stringify(`/app/${options.tenantId}/settings/members`)} && !!document.querySelector('.app-shell')`), 'AUTHORIZED_LANDING');
    };
    await login();
    const noStorage = await evaluate<boolean>('localStorage.length === 0 && sessionStorage.length === 0 && !document.cookie.includes("educore_refresh")');
    const noPasswordInDOM = await evaluate<boolean>(`!document.body.textContent.includes(${JSON.stringify(options.password)})`);
    const noTokensInDOM = await evaluate<boolean>('!(/\\beyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\b/).test(document.body.textContent)');
    const cookies = await send<{ cookies: { name: string; httpOnly: boolean; path: string; sameSite: string }[] }>('Network.getCookies', { urls: [`${apiOrigin}/api/v1/auth/refresh`] }, sessionId);
    const httpOnlyRefreshCookie = cookies.cookies.some((cookie) => cookie.name === 'educore_refresh' && cookie.httpOnly && cookie.path === '/api/v1/auth' && cookie.sameSite === 'Lax');
    const authorizedNavigation = await evaluate<boolean>(`(() => {
      const desktop = Array.from(document.querySelectorAll('.sidebar a')).map(a => a.getAttribute('href'));
      const mobile = Array.from(document.querySelectorAll('.mobile-nav a')).map(a => a.getAttribute('href'));
      const expected = ${JSON.stringify(['settings/members', 'approvals', 'audit', 'operations/jobs'].map((suffix) => `/app/${options.tenantId}/${suffix}`))};
      return expected.every(path => desktop.includes(path) && mobile.includes(path))
        && !desktop.some(path => path?.includes('/students') || path?.includes('/approvals/'))
        && !mobile.some(path => path?.includes('/students') || path?.includes('/approvals/'));
    })()`);
    await evaluate(`history.pushState(null, '', ${JSON.stringify(`/app/${options.tenantId}/students`)}); dispatchEvent(new PopStateEvent('popstate'))`);
    await until(() => evaluate<boolean>('!document.querySelector(".app-shell") && document.body.textContent.includes("Không đủ quyền")'), 'FORBIDDEN');
    await send('Page.navigate', { url: `${origin}/app/${options.tenantId}/me` }, sessionId);
    await until(() => evaluate<boolean>('!document.querySelector(".app-shell") && document.body.textContent.includes("Cần đăng nhập")'), 'RELOAD_FAIL_CLOSED');
    await send('Page.navigate', { url: `${origin}/login` }, sessionId);
    await login();
    await evaluate('document.querySelector(".top-actions button").click()');
    await until(() => evaluate<boolean>('location.pathname === "/login" && !document.querySelector(".app-shell") && document.body.textContent.includes("Bạn đã đăng xuất.")'), 'LOGOUT');
    await until(async () => network.some((entry) => entry.path === '/api/v1/auth/logout' && entry.status === 204 && entry.expectedApiOrigin), 'LOGOUT_HTTP_CONFIRMATION');
    const actualHttpSequence = ['/api/v1/auth/login', '/api/v1/auth/me', '/api/v1/auth/select-tenant', `/api/v1/tenants/${options.tenantId}/access/navigation`]
      .every((path) => network.some((entry) => entry.path === path && entry.status === 200 && entry.expectedApiOrigin));
    return { actualBrowser: true, actualNestPostgres: true, actualHttpSequence, noStorage, noPasswordInDOM, noTokensInDOM, httpOnlyRefreshCookie,
      authorizedNavigation, unreviewedRouteDenied: true, reloadFailClosed: true, logout: true };
  } finally {
    if (protocol) { await protocol.send('Browser.close').catch(() => undefined); protocol.close(); }
    if (browser && browser.exitCode === null) { await delay(500); if (browser.exitCode === null) browser.kill(); }
    await vite?.close();
    await app.close();
    await repository.close();
    // Fresh browser profile remains in OS temp; never include it in artifacts.
  }
}
