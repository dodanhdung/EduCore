import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { targets, sha, canonical, operationKey, redact, validateInput, compareHistory, createPlan, bulkSlots, Client, Operations } from './runner.mjs'
const parent=resolve('.local');mkdirSync(parent,{recursive:true})
const root=mkdtempSync(resolve(parent,'r11-unit-'))
after(()=>{if(!root.startsWith(parent+sep)||!root.includes('r11-unit-'))throw Error('INVALID_TEST_CLEANUP_PATH');rmSync(root,{recursive:true})})
const migrations=resolve(root,'apps/api/prisma/migrations/202610280001_test');mkdirSync(migrations,{recursive:true})
writeFileSync(resolve(migrations,'migration.sql'),'BEGIN;\r\nCOMMIT;\r\n')
const directory=resolve(root,'.local/r11/R11_20261028');mkdirSync(directory,{recursive:true})
function fixture(){
 const id='a'.repeat(32)
 return {root,directory,batch:'R11_20261028',referenceDate:'2026-10-28',keepLegacyPolicies:true,
  config:{id,database:`educore_demo_local_${id}`,container:`educore-local-mvp-${id.slice(0,12)}`,containerId:'b'.repeat(64),endpoint:'npipe:////./pipe/dockerDesktopLinuxEngine'},
  source:{branch:'test/r10-local-demo-data',commit:'c'.repeat(40)},apiOrigin:'http://127.0.0.1:3000',webOrigin:'http://127.0.0.1:5173',
  audit:{database:`educore_demo_local_${id}`,serverVersion:'160015',migrations:[{name:'202610280001_test',checksum:sha('BEGIN;\nCOMMIT;\n'),finished:true,rolledBack:false}],
   tenants:Object.entries(targets).map(([code,id])=>({code,id,status:'ACTIVE',timezone:'Asia/Ho_Chi_Minh',classOne:{id:'class'},walletMismatch:0,badMemberLinks:0,
    counts:{student_profiles:50,teacher_profiles:8,classes:12,enrollments:75,class_sessions:96,invoices:100,billing_runs:100,billing_periods:2,assignments:20,wallet_accounts:50},
    policies:[{version:'P0-R4-v1',current:true,valid:true},{version:'R10_DEMO_2026',current:false,valid:false}],history:[{table:'invoices',id:'original',hash:'pinned'}]}))}}
}
test('local guard accepts LF/CRLF-equivalent migrations and only exact R10 target identities',()=>{
 assert.equal(validateInput(fixture()).audit.tenants.length,3)
 for(const change of [i=>i.config.database='production',i=>i.config.containerId='x',i=>i.config.endpoint='tcp://remote:2376',i=>i.apiOrigin='http://example.com',i=>i.audit.tenants[0].id='wrong',i=>i.source.branch='main']){
  const input=fixture();change(input);assert.throws(()=>validateInput(input))
 }
})
test('incomplete cohorts, ledger mismatch, active bad policy and migration drift stop before HTTP',()=>{
 for(const change of [i=>i.audit.tenants[0].counts.invoices=99,i=>i.audit.tenants[0].walletMismatch=1,i=>i.audit.tenants[0].policies[0].valid=false,i=>i.audit.migrations[0].checksum='0'.repeat(64)]){
  const input=fixture();change(input);assert.throws(()=>validateInput(input))
 }
 assert.throws(()=>validateInput(fixture(),true),/VERIFIED_BACKUP/)
})
test('plan requires quarantine approval and real tenant date, then pins deterministic dates/keys',()=>{
 const input=fixture(),now=Date.parse('2026-10-28T10:00:00Z')
 assert.deepEqual(createPlan(input,now),createPlan(input,now))
 assert.throws(()=>createPlan({...input,keepLegacyPolicies:false},now),/QUARANTINE/)
 assert.throws(()=>createPlan(input,now+86400000),/REFERENCE_DATE/)
 assert.equal(operationKey('batch','tenant','step','POST','/x',{b:2,a:1}),operationKey('batch','tenant','step','POST','/x',{a:1,b:2}))
 assert.notEqual(operationKey('b','t','s','POST','/x',{amount:'1'}),operationKey('b','t','s','POST','/x',{amount:'2'}))
})
test('row ID/hash comparison preserves original history while allowing new appended records',()=>{
 const before=fixture().audit,after=structuredClone(before)
 after.tenants[0].history.push({table:'invoices',id:'new',hash:'new'})
 compareHistory(before,after)
 after.tenants[0].history[0].hash='overwritten';assert.throws(()=>compareHistory(before,after),/HISTORY_CHANGED/)
})
test('bulk plan covers all 12 classes, serializes resource reservations and preserves scoped learning variation',()=>{
 const input=fixture();input.scale='Bulk'
 for(const tenant of input.audit.tenants)tenant.classContexts=Array.from({length:12},(_,i)=>({id:`class-${i}`,teacherId:`teacher-${i%8}`}))
 const plan=createPlan(input,Date.parse('2026-10-28T10:00:00Z'))
 const slots=Array.from({length:12},(_,i)=>bulkSlots(input.referenceDate,i)).flat()
 assert.equal(slots.length,51);assert.equal(slots.filter(s=>s.label.startsWith('confirmed')).length,36)
 const reservations=slots.filter(s=>s.label!=='draft').sort((a,b)=>a.startsAt.localeCompare(b.startsAt))
 for(let i=1;i<reservations.length;i++)assert.ok(reservations[i-1].endsAt<=reservations[i].startsAt)
 assert.equal(plan.assignments.length,40);assert.equal(plan.assignments.filter(a=>a.keepDraft).length,8)
 assert.equal(plan.assignments.filter(a=>!a.noSubmission).length,24);assert.equal(plan.assignments.filter(a=>a.gradeKind==='published').length,8)
 for(const assignment of plan.assignments){assert.ok(assignment.priority>=1&&assignment.priority<=5);assert.ok(Number(assignment.score)>=0&&Number(assignment.score)<=10)}
})
test('uncertain reply reuses exact operation key/body; acknowledged replay never duplicates a command',async()=>{
 const input=fixture(),plan=createPlan(input,Date.parse('2026-10-28T10:00:00Z')),calls=[]
 const client={request:async(...args)=>{calls.push(args);if(calls.length===1)throw Error('lost reply');return {id:'server-id'}}}
 const ops=new Operations(input,plan,client),session={tenantId:'tenant',email:'teacher.cg@educore.invalid'}
 await assert.rejects(ops.run(session,'step','POST','/assignments',{title:'QA'}))
 const result=await ops.run(session,'step','POST','/assignments',{title:'QA'})
 assert.equal(result.id,'server-id');assert.deepEqual(calls[0],calls[1])
 await ops.run(session,'step','POST','/assignments',{title:'QA'});assert.equal(calls.length,2)
 await assert.rejects(ops.run(session,'step','POST','/assignments',{title:'changed'}),/BODY_CHANGED/)
 const saved=JSON.parse(readFileSync(resolve(directory,'journal.json'),'utf8'));assert.equal(saved.operations['tenant:step'].status,'COMMITTED')
})
test('client rejects redirect/foreign path and evidence removes credential material recursively',async()=>{
 const requests=[];const client=new Client(fixture(),async(url,init)=>{requests.push({url,init});return Response.json({items:[]})})
 await assert.rejects(client.request('GET','https://remote.invalid/api/v1/x'))
 await client.request('GET','/api/v1/tenants/t/members',undefined,{accessToken:'private'})
 assert.equal(requests[0].init.redirect,'error');assert.equal(requests[0].url,'http://127.0.0.1:3000/api/v1/tenants/t/members')
 assert.equal(canonical(redact({accessToken:'private',nested:{password:'p',items:[{csrfToken:'c',value:0}]}})),'{"nested":{"items":[{"value":0}]}}')
})
test('audit SQL has no mutation statements and workflow code contains no direct DB state flips',()=>{
 const sql=readFileSync(new URL('./audit-readonly.sql',import.meta.url),'utf8').replace(/--[^\n]*/g,'')
 assert.match(sql,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/)
 assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CALL|GRANT|REVOKE)\b/i)
 const source=readFileSync(new URL('./runner.mjs',import.meta.url),'utf8')
 assert.doesNotMatch(source,/session_replication_role|DISABLE TRIGGER|SET ROLE|UPDATE public\./i)
})
