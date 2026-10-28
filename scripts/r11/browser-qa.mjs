// Real browser/real API QA. No transport stubs, fixture injection, tokens or passwords in evidence.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { targets } from './runner.mjs'
const port=Number(process.env.EDUCORE_R11_CDP_PORT??9228)
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('INVALID_CDP_PORT')
const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target=pages.find(p=>p.type==='page'&&(p.url==='about:blank'||p.url.startsWith('http://127.0.0.1:5173/')))
if(!target)throw Error('ISOLATED_LOCAL_BROWSER_REQUIRED')
const socket=new WebSocket(target.webSocketDebuggerUrl),pending=new Map(),exceptions=[],network=[]
let counter=0
socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);pending.delete(message.id);if(message.error)p.reject(Error(message.error.message));else p.resolve(message.result)}
  else if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text)
  else if(message.method==='Network.responseReceived'&&message.params.response.url.includes('/api/v1/'))network.push({url:message.params.response.url,status:message.params.response.status})}
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++counter;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const value=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.text);return value.result.value}
async function until(expression,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100))}throw Error(`BROWSER_WAIT_FAILED:${expression}`)}
const directory=resolve('artifacts/R11-runtime-2026-10-28');mkdirSync(directory,{recursive:true})
const password=readFileSync(resolve('apps/api/scripts/seed-demo.ts'),'utf8').match(/const password = '([^']+)';/)?.[1]
if(!password)throw Error('LOCAL_SYNTHETIC_PASSWORD_SOURCE_REQUIRED')
const evidence=[]
const tenant=targets.DEMO_R10_CG
async function go(suffix){
  const path=`/app/${tenant}${suffix}`
  await evaluate(`history.pushState(null,'',${JSON.stringify(path)});window.dispatchEvent(new PopStateEvent('popstate'))`)
}
async function screenshot(name,width){
  const data=await evaluate(`({url:location.href,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,text:document.querySelector('main')?.innerText??document.body.innerText,fixture:typeof window.__qaCalls!=='undefined',brokenImages:[...document.querySelectorAll('img')].filter(i=>!i.complete||!i.naturalWidth).length})`)
  if(data.fixture||data.brokenImages||data.scrollWidth>width||exceptions.length)throw Error(`REAL_UI_CHECK_FAILED:${name}`)
  const height=await evaluate('document.documentElement.scrollHeight')
  const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height,scale:1}})
  const file=`${name}-${width}.png`;writeFileSync(resolve(directory,file),Buffer.from(image.data,'base64'))
  evidence.push({...data,file,network:network.splice(0),exceptions:[...exceptions]})
  console.log(JSON.stringify({screen:name,width,scrollWidth:data.scrollWidth,realApiResponses:evidence.at(-1).network.length}))
}
async function login(email){
  await send('Page.navigate',{url:'http://127.0.0.1:5173/login'})
  await until(`!!document.querySelector('#login-email')`)
  for(const [selector,value] of [['#login-email',email],['#login-password',password]]){
    await evaluate(`{const input=document.querySelector(${JSON.stringify(selector)});input.focus();input.select()}`)
    await send('Input.insertText',{text:value})
  }
  await evaluate(`document.querySelector('form').requestSubmit()`)
  await until(`!!document.querySelector('.ec-tenant-choice')`)
  await evaluate(`{const button=[...document.querySelectorAll('.ec-tenant-choice')].find(b=>b.textContent.includes('Sao Mai'));if(!button)throw Error('QA_TENANT_NOT_ALLOWED');button.click()}`)
  await until(`!!document.querySelector('.app-shell')`)
}
async function logout(){
  await evaluate(`document.querySelector('.account-menu').open=true;document.querySelector('.top-actions button').click()`)
  await until(`!!document.querySelector('#login-email')`)
}
async function capture(screen,suffix,ready){
  await go(suffix);await until(ready)
  for(const width of [1280,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await new Promise(r=>setTimeout(r,100));await screenshot(screen,width)}
}
try{
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await login('manager.cg@educore.invalid')
  await capture('G01','/overview',`document.querySelectorAll('.mo-metric').length===3`)
  await capture('OP01','/settings/members',`!!document.querySelector('[data-screen-id="OP01"] table tbody tr')`)
  await capture('BL03','/finance/billing-periods',`!!document.querySelector('[data-screen-id="BL03"] .billing-table tbody tr')`)
  await go('/finance/invoices');await until(`document.body.innerText.includes('Chưa có hóa đơn')||document.body.innerText.includes('403')`);await screenshot('BL06-empty-or-forbidden',390)
  await logout();await login('teacher.cg@educore.invalid')
  await capture('AS01','/teaching/assignments',`!!document.querySelector('.as-page table tbody tr')`)
  await evaluate(`{const input=document.querySelector('.as-field input[type="search"]');input.focus();input.select()}`)
  await send('Input.insertText',{text:'Không có bài tập khớp bộ lọc R11 QA'})
  await until(`document.body.innerText.includes('Không có bài tập phù hợp')`);await screenshot('AS01-filter-empty',390)
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Xóa bộ lọc').click()`)
  await capture('PO01','/teacher',`!!document.querySelector('[data-screen-id="PO01"] .portal-kpi')`)
  // Genuine browser network faults exercise loading/retry without substituting API data.
  await send('Network.emulateNetworkConditions',{offline:false,latency:2500,downloadThroughput:-1,uploadThroughput:-1})
  await go('/teaching/assignments');await until(`!!document.querySelector('.ec-loading')`)
  await screenshot('AS01-loading',390)
  await until(`!!document.querySelector('.as-page table tbody tr')`)
  await send('Network.setBlockedURLs',{urls:['*127.0.0.1:3000/api/v1/tenants/*/grading/queue*']})
  await go('/teacher');await until(`!!document.querySelector('[data-screen-id="PO01"] .portal-kpi')&&document.body.innerText.includes('Không thể tải hàng chờ chấm')`)
  await screenshot('PO01-partial-network',390)
  await send('Network.setBlockedURLs',{urls:[]})
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Thử tải lại các mục lỗi').click()`)
  await until(`!!document.querySelector('[data-screen-id="PO01"] .portal-kpi')&&!document.body.innerText.includes('Không thể tải hàng chờ chấm')`)
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
  await go('/teacher');await until(`!!document.querySelector('[data-screen-id="PO01"] .portal-kpi')`)
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0})
  await go('/teaching/assignments');await until(`!!document.querySelector('.as-page [role="alert"]')`)
  await screenshot('AS01-network-error',390)
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Thử lại').click()`)
  await until(`!!document.querySelector('.as-page table tbody tr')`)
  await logout();await login('student.cg@educore.invalid')
  await go('/settings/members');await until(`document.body.innerText.includes('403')`)
  await screenshot('OP01-student-forbidden',390)
  await go('/my/assignments');await until(`!!document.querySelector('.as-page')`)
  // Actual learner billing projection may be partial; retain its real response in API evidence, never fabricate one.
  await go('/my/billing');await new Promise(r=>setTimeout(r,1000));await screenshot('PO05-student',390)
  await go('/me');await until(`!!document.querySelector('.account-menu')`);await logout()
  if(!network.concat(...evidence.map(e=>e.network)).some(r=>r.url.startsWith('http://127.0.0.1:3000/api/v1/')))throw Error('REAL_API_NOT_OBSERVED')
}finally{
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1}).catch(()=>{})
  await send('Network.setBlockedURLs',{urls:[]}).catch(()=>{})
  writeFileSync(resolve(directory,'browser-evidence.json'),JSON.stringify(evidence,null,2))
  socket.close()
}
