import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import type { INestApplication } from '@nestjs/common';
import { cdp, edgePath, until } from './browser-auth.js';

type Protocol = Awaited<ReturnType<typeof cdp>>;
type WebServer = { listen: () => Promise<unknown>; close: () => Promise<void> };
export type BrowserDriver = {
  origin: string;
  apiOrigin: string;
  browserVersion: string;
  network: { path: string; status: number; method: string }[];
  evaluate: <T>(expression: string) => Promise<T>;
  navigate: (path: string) => Promise<void>;
  route: (path: string) => Promise<void>;
  wait: (expression: string, label: string) => Promise<void>;
  click: (selector: string) => Promise<void>;
  fill: (selector: string, value: string) => Promise<void>;
  value: (selector: string, value: string) => Promise<void>;
  select: (selector: string, value: string) => Promise<void>;
  login: (email: string, password: string, tenantId: string) => Promise<void>;
  viewport: (width: number, height: number, mobile: boolean) => Promise<void>;
};

// Every response is a real browser network response. Only method/path/status are retained.
// No request headers, credentials, cookies, body, DOM dump or file contents enter evidence.
export async function withAcademicBrowser<T>(app: INestApplication, run: (driver: BrowserDriver) => Promise<T>): Promise<T> {
  if (!existsSync(edgePath)) throw Error('EDGE_TEST_ENVIRONMENT_UNAVAILABLE');
  if (process.env.R4_TEST_DISPOSABLE !== 'I_OWN_THIS_DISPOSABLE_CLUSTER') throw Error('DISPOSABLE_REQUIRED');
  const origin = 'http://localhost:5173';
  const webRoot = fileURLToPath(new URL('../../../web/', import.meta.url));
  const webRequire = createRequire(join(webRoot, 'package.json'));
  const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href) as {
    createServer: (config: unknown) => Promise<WebServer>;
  };
  let vite: WebServer | undefined;
  let browser: ChildProcess | undefined;
  let protocol: Protocol | undefined;
  let profile: string | undefined;
  try {
    if (!app.getHttpServer().address()) await app.listen(0, '127.0.0.1');
    const apiOrigin = `http://localhost:${(app.getHttpServer().address() as { port: number }).port}`;
    vite = await createServer({ root: webRoot, logLevel: 'silent',
      server: { host: 'localhost', port: 5173, strictPort: true, hmr: false },
      define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiOrigin) } });
    await vite.listen();
    const served = await (await fetch(`${origin}/src/App.tsx`)).text();
    if (!served.includes(apiOrigin)) throw Error('BROWSER_TEST_API_ORIGIN_NOT_INJECTED');
    profile = await mkdtemp(join(tmpdir(), 'educore-r9-browser-'));
    browser = spawn(edgePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-component-update', '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    const port = await until(async () => {
      try { return (await readFile(join(profile!, 'DevToolsActivePort'), 'utf8')).split('\n'); }
      catch { return false; }
    }, 'DEBUGGER');
    if (!port) throw Error('BROWSER_TIMEOUT_DEBUGGER');
    protocol = await cdp(`ws://127.0.0.1:${port[0]}${port[1]}`);
    const version = await protocol.send<{ product: string }>('Browser.getVersion');
    const { targetId } = await protocol.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await protocol.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
    const send = protocol.send;
    const network: BrowserDriver['network'] = [];
    const methods = new Map<string, string>();
    protocol.onEvent((event) => {
      if (event.method === 'Network.requestWillBeSent') {
        const x = event.params as { requestId: string; request: { method: string } };
        methods.set(x.requestId, x.request.method);
      }
      if (event.method === 'Network.responseReceived') {
        const x = event.params as { requestId: string; response: { url: string; status: number } };
        const url = new URL(x.response.url);
        if (url.origin === apiOrigin) network.push({ path: url.pathname, status: x.response.status,
          method: methods.get(x.requestId) ?? 'UNKNOWN' });
      }
    });
    const evaluate = async <R>(expression: string): Promise<R> => {
      const result = await send<{ result: { value: R }; exceptionDetails?: unknown }>('Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (result.exceptionDetails) throw Error('BROWSER_EVALUATION_FAILED');
      return result.result.value;
    };
    await send('Page.enable', {}, sessionId);
    await send('Network.enable', {}, sessionId);
    const driver: BrowserDriver = {
      origin, apiOrigin, browserVersion: version.product, network, evaluate,
      navigate: async (path) => { await send('Page.navigate', { url: `${origin}${path}` }, sessionId); },
      route: async (path) => { await evaluate(`history.pushState(null, '', ${JSON.stringify(path)}); dispatchEvent(new PopStateEvent('popstate'))`); },
      wait: async (expression, label) => { await until(() => evaluate<boolean>(expression), label); },
      click: async (selector) => { await evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`); },
      fill: async (selector, value) => {
        await evaluate(`document.querySelector(${JSON.stringify(selector)})?.focus()`);
        await send('Input.insertText', { text: value }, sessionId);
      },
      value: async (selector, value) => {
        await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) throw Error('MISSING_INPUT');
          const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, ${JSON.stringify(value)});
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      },
      select: async (selector, value) => {
        await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) throw Error('MISSING_SELECT');
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
          el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      },
      viewport: async (width, height, mobile) => { await send('Emulation.setDeviceMetricsOverride',
        { width, height, deviceScaleFactor: 1, mobile }, sessionId); },
      login: async (email, password, tenantId) => {
        await send('Page.navigate', { url: `${origin}/login` }, sessionId);
        await until(() => evaluate<boolean>('!!document.querySelector("#login-email")'), 'LOGIN_FORM');
        await driver.fill('#login-email', email);
        await driver.fill('#login-password', password);
        await driver.click('form button[type="submit"]');
        await until(() => evaluate<boolean>('location.pathname === "/select-tenant" && !!document.querySelector(".ec-tenant-choice")'), 'TENANT_SELECTION');
        await driver.click('.ec-tenant-choice');
        await until(() => evaluate<boolean>(`location.pathname.startsWith(${JSON.stringify(`/app/${tenantId}/`)}) && !!document.querySelector('.app-shell')`), 'AUTHORIZED_LANDING');
      },
    };
    return await run(driver);
  } finally {
    if (protocol) { await protocol.send('Browser.close').catch(() => undefined); protocol.close(); }
    if (browser && browser.exitCode === null) browser.kill();
    await vite?.close();
    if (profile && resolve(profile).startsWith(resolve(tmpdir()) + sep)
      && basename(profile).startsWith('educore-r9-browser-')) {
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined);
    }
  }
}
