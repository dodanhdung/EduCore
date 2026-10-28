import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, renameSync, existsSync, readdirSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

export const targets = {
  DEMO_R10_CG: '4b40931b-9399-408e-bc2c-f77668ef7d19',
  DEMO_R10_HD: 'ecf96a7a-2f7d-4386-a8f9-f8377933a888',
  DEMO_R10_LB: '803ffbeb-1885-4c63-96c0-0bd0c2caf694',
}
export const sha = value => createHash('sha256').update(value).digest('hex')
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
  return JSON.stringify(value)
}
export function operationKey(batch, tenant, label, method, path, body) {
  return `R11:${sha(canonical({ batch, tenant, label, method, path, body }))}`
}
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([k]) => !/token|password|cookie|secret/i.test(k)).map(([k,v]) => [k,redact(v)]))
}
const read = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
function save(path, value) {
  const temp = `${path}.tmp`
  writeFileSync(temp, JSON.stringify(redact(value), null, 2), { mode: 0o600 })
  renameSync(temp, path)
}
function inside(root, path) { const rel = relative(resolve(root),resolve(path)); return !!rel && !rel.startsWith('..') && !/^[A-Za-z]:/.test(rel) }
export function validateInput(input, mutation = false) {
  const c = input.config
  if (!c || !/^[0-9a-f]{32}$/.test(c.id) || c.database !== `educore_demo_local_${c.id}` || !/^[0-9a-f]{64}$/.test(c.containerId)
    || c.container !== `educore-local-mvp-${c.id.slice(0,12)}` || !/^(npipe:\/\/\/\/\.\/pipe\/[^\s]+|unix:\/[^\s]+)$/.test(c.endpoint)) throw Error('LOCAL_IDENTITY_REQUIRED')
  if (input.apiOrigin !== 'http://127.0.0.1:3000' || input.webOrigin !== 'http://127.0.0.1:5173') throw Error('LOOPBACK_API_REQUIRED')
  if (input.source?.branch !== 'test/r10-local-demo-data' || !/^[0-9a-f]{40}$/.test(input.source.commit)) throw Error('EXPECTED_SOURCE_REQUIRED')
  if (!/^R11_[0-9]{8}[a-z0-9_-]*$/.test(input.batch) || !inside(resolve(input.root,'.local/r11'),input.directory)) throw Error('BATCH_PATH_INVALID')
  if(!['Representative','Bulk'].includes(input.scale??'Representative'))throw Error('BATCH_SCALE_INVALID')
  const a = input.audit
  if (a.database !== c.database || Number(a.serverVersion) < 160000 || Number(a.serverVersion) >= 170000) throw Error('DATABASE_OR_VERSION_MISMATCH')
  if (a.tenants?.length !== 3 || new Set(a.tenants.map(t=>t.code)).size !== 3) throw Error('EXACT_R10_COHORT_REQUIRED')
  for (const t of a.tenants) {
    if (targets[t.code] !== t.id || t.timezone !== 'Asia/Ho_Chi_Minh' || t.status !== 'ACTIVE' || !t.classOne?.id) throw Error('TENANT_SOURCE_MISMATCH')
    for(const [table,minimum] of Object.entries({student_profiles:50,teacher_profiles:8,classes:12,enrollments:75,class_sessions:96,invoices:100,billing_runs:100,billing_periods:2,assignments:20,wallet_accounts:50})) {
      if (t.counts[table] < minimum) throw Error(`PARTIAL_R10_IMPORT:${t.code}:${table}`)
    }
    if(t.walletMismatch || t.badMemberLinks || Object.values(t.integrity??{}).some(n=>n!==0)) throw Error('EXISTING_INTEGRITY_FAILURE')
    const current=t.policies.filter(p=>p.current)
    if(current.length!==1 || !current[0].valid || current[0].version!=='P0-R4-v1') throw Error('VALID_CURRENT_P0_POLICY_REQUIRED')
    if(t.policies.some(p=>!p.valid&&p.version!=='R10_DEMO_2026')) throw Error('UNEXPECTED_INVALID_POLICY')
  }
  const folders=readdirSync(resolve(input.root,'apps/api/prisma/migrations'),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort()
  const migrations=a.migrations
  if(migrations?.length!==folders.length || new Set(migrations.map(m=>m.name)).size!==folders.length) throw Error('MIGRATION_SET_MISMATCH')
  for(const m of migrations) {
    if(!folders.includes(m.name)||!m.finished||m.rolledBack) throw Error('MIGRATION_INCOMPLETE')
    const bytes=readFileSync(resolve(input.root,'apps/api/prisma/migrations',m.name,'migration.sql'))
    const lf=bytes.toString('utf8').replace(/\r\n/g,'\n')
    if(![sha(bytes),sha(lf),sha(lf.replace(/\n/g,'\r\n'))].includes(m.checksum)) throw Error(`MIGRATION_DRIFT:${m.name}`)
  }
  if (mutation && (!input.keepLegacyPolicies || !input.sourceAttested || input.runtime?.commit!==input.source.commit || !input.backup?.verified
    || !inside(resolve(input.root,'.local/backups'),input.backup.path) || !existsSync(input.backup.path)
    || sha(readFileSync(input.backup.path)).toLowerCase()!==input.backup.sha256.toLowerCase()
    || !/^educore_demo_local_[0-9a-f]{32}$/.test(input.backup.restoredDatabase) || input.backup.restoredDatabase===c.database)) throw Error('VERIFIED_BACKUP_AND_RUNTIME_ATTESTATION_REQUIRED')
  return input
}
export function compareHistory(before, after) {
  const changed=[]
  for(const original of before.tenants) {
    const current=after.tenants.find(t=>t.id===original.id)
    if(!current) throw Error('TENANT_DISAPPEARED')
    const rows=new Map(current.history.map(row=>[`${row.table}:${row.id}`,row.hash]))
    for(const row of original.history) if(rows.get(`${row.table}:${row.id}`)!==row.hash) changed.push(`${original.code}:${row.table}:${row.id}`)
    if(current.walletMismatch||current.badMemberLinks||Object.values(current.integrity??{}).some(n=>n!==0)) changed.push(`${original.code}:integrity`)
  }
  if(changed.length) throw Error(`ORIGINAL_HISTORY_CHANGED:${changed.slice(0,5).join(',')}`)
}
export function createPlan(input, now = Date.now()) {
  if(!input.keepLegacyPolicies) throw Error('EXPLICIT_LEGACY_QUARANTINE_REQUIRED')
  const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
  if(localDate!==input.referenceDate) throw Error('REFERENCE_DATE_MUST_MATCH_REAL_TENANT_TODAY')
  const firstStart=new Date(now+180_000).toISOString()
  const dateBase=Date.parse(`${input.referenceDate}T11:00:00.000Z`)
  if(input.scale==='Bulk'){
    if(input.audit.tenants.some(t=>t.classContexts?.length!==12||t.classContexts.some(c=>!c.teacherId)))throw Error('TWELVE_VERIFIED_CLASS_CONTEXTS_REQUIRED')
    return {schemaVersion:1,scale:'Bulk',activationPending:true,batch:input.batch,source:input.source,config:input.config,referenceDate:input.referenceDate,createdAt:new Date(now).toISOString(),baseline:input.audit,
      assignmentValidFrom:new Date(Date.parse(`${input.referenceDate}T00:00:00+07:00`)+86400_000).toISOString(),
      assignments:Array.from({length:40},(_,i)=>({label:`bulk-${String(i+1).padStart(3,'0')}`,title:`R11B · Toán 6 — ${['Phân số','Số thập phân','Hình học','Tỉ lệ và phần trăm','Bài toán thực tế'][i%5]} · Bài ${i+1}`,priority:i%5+1,
        deadlineAt:new Date(dateBase+(i>=24&&i<29?-1:2+i%12)*86400_000).toISOString(),keepDraft:i>=32,noSubmission:i>=24,gradeKind:i<8?'published':i<16?'draft':'none',score:(6.5+(i*7%30)/10).toFixed(1)})),
      blockers:[{scope:'People',status:'API_UNSUPPORTED',reason:'No competency/login-profile binding transport. Reuse existing grants; learning cohort uses CG Teacher class only.'},{scope:'History/finance',status:'BLOCKED',reason:'No backdated confirmation/completion or valid closed-period source; retain legacy R10 snapshots and financial cohort.'}]}
  }
  return {schemaVersion:1,activationPending:true,batch:input.batch,source:input.source,config:input.config,referenceDate:input.referenceDate,createdAt:new Date(now).toISOString(),
    baseline:input.audit,assignmentValidFrom:new Date(now+30_000).toISOString(),
    sessions:[{label:'today',startsAt:firstStart},{label:'upcoming',startsAt:new Date(dateBase+2*86400_000).toISOString()},
      {label:'draft',startsAt:new Date(dateBase+3*86400_000).toISOString()},{label:'cancelled',startsAt:new Date(dateBase+4*86400_000).toISOString()}]
      .map(s=>({...s,endsAt:new Date(Date.parse(s.startsAt)+90*60_000).toISOString()})),
    assignments:[{label:'published-grade',title:'R11 · Toán 6 — Phân số và ứng dụng',priority:4,deadlineAt:new Date(dateBase+3*86400_000).toISOString()},
      {label:'draft-grade',title:'R11 · Hình học — Chu vi và diện tích',priority:3,deadlineAt:new Date(dateBase+4*86400_000).toISOString()},
      {label:'awaiting-grade',title:'R11 · Ôn tập — Giải bài toán thực tế',priority:5,deadlineAt:new Date(dateBase+5*86400_000).toISOString()},
      {label:'no-submission',title:'R11 · Tự luyện — Tính toán số học',priority:2,deadlineAt:new Date(dateBase-86400_000).toISOString()},
      {label:'draft',title:'R11 · Bản nháp — Đề luyện tập tiếp theo',priority:1,deadlineAt:new Date(dateBase+7*86400_000).toISOString()}],
    blockers:[{scope:'People',status:'API_UNSUPPORTED',reason:'No competency or login/profile binding write endpoint. Reuse CG role cohort; no IAM modification.'},
      {scope:'COMPLETED',status:'API_UNSUPPORTED',reason:'No session completion endpoint; never flip state or backdate.'},
      {scope:'Billing/BL07',status:'BLOCKED',reason:'Legacy drafts pin invalid immutable policy and have no generations; new source is in an open month. No valid ISSUED source for payments/adjustments.'}]}
}
export class ApiFailure extends Error { constructor(method,path,status,code){super(`${method} ${path} HTTP ${status} ${code||''}`);this.status=status;this.code=code} }
export class Client {
  constructor(input,transport=fetch){this.input=input;this.transport=transport;this.sessions=new Map();this.evidence=[]}
  async request(method,path,body,session,headers={}) {
    if(!path.startsWith('/api/v1/')||path.includes('://')) throw Error('API_PATH_REFUSED')
    const response=await this.transport(`${this.input.apiOrigin}${path}`,{method,redirect:'error',signal:AbortSignal.timeout(30_000),
      headers:{Origin:this.input.webOrigin,Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'}),...(session?{Authorization:`Bearer ${session.accessToken}`} : {}),...headers},
      ...(body===undefined?{}:{body:JSON.stringify(body)})})
    const value=response.status===204?null:await response.json()
    if(!response.ok)throw new ApiFailure(method,path,response.status,value?.code??value?.message)
    return value
  }
  async session(email,tenantId){
    const key=`${email}:${tenantId}`
    if(this.sessions.has(key))return this.sessions.get(key)
    const password=process.env.EDUCORE_R11_QA_PASSWORD
    if(!password)throw Error('LOCAL_QA_PASSWORD_REQUIRED')
    if(!/^(manager\.(cg|hd|lb)|(teacher|student|parent|accountant|academic)\.cg)@educore\.invalid$/.test(email))throw Error('NON_R10_LOGIN_REFUSED')
    const login=await this.request('POST','/api/v1/auth/login',{email,password})
    const selected=await this.request('POST','/api/v1/auth/select-tenant',{tenantId},login)
    if(selected.principal?.tenantId!==tenantId||!selected.accessToken)throw Error('TENANT_SELECTION_NOT_CONFIRMED')
    const session={...selected,email,tenantId};this.sessions.set(key,session);return session
  }
  async get(session,suffix){
    const path=`/api/v1/tenants/${session.tenantId}${suffix}`
    try{const result=await this.request('GET',path,undefined,session);this.evidence.push({actor:session.email,path,status:200,response:redact(result)});return result}
    catch(error){this.evidence.push({actor:session.email,path,status:error.status??0,code:error.code??'NETWORK'});throw error}
  }
  async close(){for(const session of this.sessions.values()){try{await this.request('POST','/api/v1/auth/logout',undefined,session)}catch{this.evidence.push({actor:session.email,path:'/api/v1/auth/logout',status:'UNCONFIRMED'})}}this.sessions.clear()}
}
export class Operations {
  constructor(input,plan,client){this.input=input;this.plan=plan;this.client=client;this.path=resolve(input.directory,'journal.json');this.journal=existsSync(this.path)?read(this.path):{batch:plan.batch,planHash:sha(canonical(plan)),operations:{}};if(this.journal.planHash!==sha(canonical(plan)))throw Error('JOURNAL_PLAN_MISMATCH')}
  async run(session,label,method,suffix,body,headers={}){
    const path=`/api/v1/tenants/${session.tenantId}${suffix}`, id=`${session.tenantId}:${label}`
    const key=operationKey(this.plan.batch,session.tenantId,label,method,path,body)
    const prior=this.journal.operations[id]
    if(prior&&(prior.key!==key||canonical(prior.headers)!==canonical(headers)))throw Error(`OPERATION_BODY_CHANGED:${label}`)
    if(prior?.status==='COMMITTED')return prior.response
    // Persist intent before HTTP. An uncertain operation is only retried with this exact body/key.
    this.journal.operations[id]={actor:session.email,label,method,path,body,headers,key,status:'PENDING'};save(this.path,this.journal)
    try{
      const value=await this.client.request(method,path,body,session,{'Idempotency-Key':key,...headers})
      this.journal.operations[id]={...this.journal.operations[id],status:'COMMITTED',response:redact(value)};save(this.path,this.journal)
      return value
    }catch(error){this.journal.operations[id].error={status:error.status??0,code:error.code??'UNCERTAIN'};save(this.path,this.journal);throw error}
  }
}
const managerEmail=t=>`manager.${t.code.split('_')[2].toLowerCase()}@educore.invalid`
const reason=(plan,label)=>`${plan.batch}: dữ liệu QA tổng hợp, không phải nghiệp vụ thật · ${label}`
async function people(plan,client,ops){
  for(const t of plan.baseline.tenants){
    const manager=await client.session(managerEmail(t),t.id)
    for(const p of t.teachers){
      if(p.contact)continue
      const expected=`${plan.batch.toLowerCase()}.${p.code.toLowerCase()}@qa.educore.invalid`
      const current=await client.get(manager,`/academic/teachers/${p.id}`)
      const id=`${t.id}:contact:${p.id}`
      if(current.contact===expected){
        // The profile endpoint has no idempotency transport. Resolve a lost reply by its exact unique QA marker before another PATCH.
        if(!ops.journal.operations[id])throw Error('PROFILE_QA_MARKER_WITHOUT_INTENT')
        ops.journal.operations[id].status='COMMITTED';ops.journal.operations[id].response={id:p.id,contact:expected,reconciled:true};save(ops.path,ops.journal)
        continue
      }
      if(current.contact||current.name!==p.name)throw Error('PROFILE_CHANGED_REQUIRES_REVIEW')
      await ops.run(manager,`contact:${p.id}`,'PATCH',`/academic/profiles/teachers/${p.id}`,{name:p.name,contact:expected,reason:reason(plan,'Điền contact QA vào field trống')})
    }
  }
}
async function schedules(input,plan,client,ops){
  for(const t of plan.baseline.tenants){
    const manager=await client.session(managerEmail(t),t.id)
    const contexts=plan.scale==='Bulk'?t.classContexts:[t.classOne]
    for(const [index,c] of contexts.entries()){
    const prefix=plan.scale==='Bulk'?`${c.code}:`:''
    if(!c.assigned)await ops.run(manager,`${prefix}class-teacher`,'POST','/academic/teacher-assignments',{classId:c.id,teacherId:c.teacherId,validFrom:plan.assignmentValidFrom,validTo:null,reason:reason(plan,'Phân công cohort mới'),confirmed:true})
    const slots=plan.scale==='Bulk'?bulkSlots(plan.referenceDate,index):plan.sessions
    for(const spec of slots){
      const created=await ops.run(manager,`${prefix}session:${spec.label}`,'POST','/scheduling/sessions',{classId:c.id,teacherId:c.teacherId,roomId:c.roomId,deliveryMode:c.deliveryMode??'ONSITE',startsAt:spec.startsAt,endsAt:spec.endsAt,reason:reason(plan,`Buổi ${spec.label}`)})
      const id=created.sessionIds?.[0]??created.id
      if(!id)throw Error('SESSION_RESPONSE_INVALID')
      if(spec.label!=='draft')await ops.run(manager,`${prefix}confirm:${spec.label}`,'POST',`/scheduling/sessions/${id}/confirm`,{reason:reason(plan,'Xác nhận lịch qua conflict checks')})
      if(spec.label==='cancelled'){
        const detail=await client.get(manager,`/scheduling/sessions/${id}`)
        const revision=ops.journal.operations[`${t.id}:${prefix}cancel:cancelled`]?.body.revision??detail.revision??detail.session?.revision
        await ops.run(manager,`${prefix}cancel:cancelled`,'POST',`/scheduling/sessions/${id}/cancel`,{revision,reason:reason(plan,'Tình huống hủy buổi QA')})
      }
    }
    }
    console.log(`${t.code}: scheduling cohort acknowledged by API`)
  }
}
export function bulkSlots(referenceDate,index){
  const midnight=Date.parse(`${referenceDate}T00:00:00+07:00`),hours=[8,10,13,15]
  const rows=Array.from({length:3},(_,occurrence)=>{const n=index*3+occurrence;return {label:`confirmed-${occurrence+1}`,day:1+Math.floor(n/4),hour:hours[n%4]}})
  rows.push({label:'draft',day:10+Math.floor(index/4),hour:hours[index%4]})
  if(index<3)rows.push({label:'cancelled',day:13,hour:hours[index]})
  return rows.map(s=>({label:s.label,startsAt:new Date(midnight+s.day*86400_000+s.hour*3600_000).toISOString(),endsAt:new Date(midnight+s.day*86400_000+(s.hour*60+90)*60_000).toISOString()}))
}
async function learning(plan,client,ops){
  const t=plan.baseline.tenants.find(t=>t.code==='DEMO_R10_CG')
  const teacher=await client.session('teacher.cg@educore.invalid',t.id), student=await client.session('student.cg@educore.invalid',t.id)
  const linked=t.students.find(s=>s.membershipId===t.memberships.find(m=>m.email==='student.cg@educore.invalid')?.id)
  if(!linked)throw Error('EXISTING_STUDENT_LINK_REQUIRED')
  for(const spec of plan.assignments){
    const created=await ops.run(teacher,`assignment:${spec.label}`,'POST','/assignments',{classId:t.classOne.id,title:spec.title,description:'Bài luyện tập tổng hợp R11 cho kiểm thử API và giao diện; không chứa dữ liệu học sinh thật.',priority:spec.priority,deadlineAt:spec.deadlineAt,reason:reason(plan,spec.label)})
    if(spec.keepDraft??spec.label==='draft')continue
    await ops.run(teacher,`publish:${spec.label}`,'POST',`/assignments/${created.id}/publish`,{}, {'If-Match':String(created.revision)})
    if(spec.noSubmission??spec.label==='no-submission')continue
    const mine=await client.get(student,'/my/assignments')
    const recipient=mine.items?.find(r=>r.id===created.id)
    if(!recipient?.recipientId)throw Error('REAL_SCOPED_RECIPIENT_REQUIRED')
    const submission=await ops.run(student,`submission:${spec.label}`,'POST',`/assignment-recipients/${recipient.recipientId}/submissions`,{answerText:`Bài giải QA ${spec.label}: trình bày phép tính và kiểm tra kết quả.`,fileIds:[]})
    const versionId=submission.versionId??submission.id
    const kind=spec.gradeKind??(spec.label==='published-grade'?'published':spec.label==='draft-grade'?'draft':'none')
    if(kind==='none')continue
    const grade=await ops.run(teacher,`grade:${spec.label}`,'PUT',`/submission-versions/${versionId}/grade-draft`,{score:spec.score??(kind==='published'?'8.5':'7.0'),feedback:'Nhận xét tổng hợp QA: trình bày rõ các bước giải.',reason:reason(plan,'Chấm bài mẫu qua API')},{'If-Match':'0'})
    if(kind==='published')await ops.run(teacher,spec.label==='published-grade'?'publish-grade':`publish-grade:${spec.label}`,'POST',`/submission-versions/${versionId}/grades/publish`,{revision:grade.revision})
  }
  console.log('DEMO_R10_CG: assignment/submission/grade cohort acknowledged by API')
}
async function attendance(plan,client,ops){
  const t=plan.baseline.tenants.find(t=>t.code==='DEMO_R10_CG'),manager=await client.session(managerEmail(t),t.id)
  const teacher=await client.session('teacher.cg@educore.invalid',t.id),parent=await client.session('parent.cg@educore.invalid',t.id)
  const member=t.memberships.find(m=>m.email==='student.cg@educore.invalid'),student=t.students.find(s=>s.membershipId===member.id)
  const sheets={}
  for(const label of ['today','upcoming']){
    const created=ops.journal.operations[`${t.id}:session:${label}`].response,id=created.sessionIds?.[0]??created.id
    const sheet=await client.get(teacher,`/attendance/sessions/${id}`);sheets[label]={id,sheet}
    const rows=sheet.participants??sheet.items??sheet.roster
    if(!Array.isArray(rows)||!rows.length)throw Error('ATTENDANCE_ROSTER_RESPONSE_INVALID')
    const mine=rows.find(p=>p.studentId===student.id||p.student_id===student.id)
    if(!mine)throw Error('LINKED_CHILD_PARTICIPATION_REQUIRED')
    const participantId=mine.participantId??mine.id
    const leave=await ops.run(parent,`leave:${label}`,'POST','/attendance/leaves',{participantId,reason:reason(plan,label==='today'?'Xin nghỉ gần giờ, ghi nhận trễ thật':'Xin nghỉ đúng hạn cho buổi sắp tới')})
    await ops.run(manager,`approve-leave:${label}`,'POST',`/attendance/leaves/${leave.id}/approve`,{reason:reason(plan,'Duyệt nghỉ có phân quyền; người duyệt khác requester')})
  }
  const starts=Date.parse(plan.sessions.find(s=>s.label==='today').startsAt)
  while(Date.now()<starts){const delay=Math.min(20_000,starts-Date.now()+100);console.log(`Attendance waiting for real session start: ${Math.ceil((starts-Date.now())/1000)}s`);await new Promise(r=>setTimeout(r,delay))}
  const {id}=sheets.today,sheet=await client.get(teacher,`/attendance/sessions/${id}`),rows=sheet.participants??sheet.items??sheet.roster
  for(let i=0;i<rows.length;i++){
    const p=rows[i],participantId=p.participantId??p.id,isMine=(p.studentId??p.student_id)===student.id
    await ops.run(teacher,`mark:${participantId}`,'POST',`/attendance/sessions/${id}/marks`,{participantId,status:isMine?'EXCUSED':i===rows.length-1?'UNEXCUSED':'ATTENDED',revision:ops.journal.operations[`${t.id}:mark:${participantId}`]?.body.revision??p.revision??p.attendanceRevision??0,reason:reason(plan,'Điểm danh bằng giáo viên phụ trách sau giờ bắt đầu thật')})
  }
  await ops.run(teacher,'finalize-today','POST',`/attendance/sessions/${id}/finalize`,{reason:reason(plan,'Xác nhận đầy đủ roster và provenance thực')})
  console.log('DEMO_R10_CG: attendance finalized through assigned teacher API')
}
async function wallet(plan,client,ops){
  const t=plan.baseline.tenants.find(t=>t.code==='DEMO_R10_CG'),accountant=await client.session('accountant.cg@educore.invalid',t.id),manager=await client.session(managerEmail(t),t.id)
  const member=t.memberships.find(m=>m.email==='student.cg@educore.invalid'),student=t.students.find(s=>s.membershipId===member.id)
  for(const [label,amount] of [['retained','1000000'],['reversed','300000']])await ops.run(accountant,`topup:${label}`,'POST',`/students/${student.id}/wallet/top-ups`,{amountVnd:amount,method:'CASH',receiptReference:`SYNTHETIC-${plan.batch}-${label}`,evidence:'SYNTHETIC LOCAL QA ONLY — fictional cash receipt, no real funds or external integration.',reason:reason(plan,'TOP_UP QA với ledger qua API'),confirmed:true})
  const view=await client.get(accountant,`/finance/students/${student.id}`)
  const original=view.transactions?.find(r=>r.receiptReference===`SYNTHETIC-${plan.batch}-reversed`)
  if(!original)throw Error('TOPUP_LEDGER_RECEIPT_NOT_FOUND')
  const request=await ops.run(accountant,'reverse-topup-request','POST',`/wallet/top-ups/${original.id}/reversal-requests`,{reason:reason(plan,'Yêu cầu đảo toàn phần receipt QA riêng'),confirmed:true})
  const approvalId=request.approvalRequestId??request.approvalId??request.id
  await ops.run(manager,'approve-topup-reversal','POST',`/approvals/${approvalId}/decisions`,{decision:'APPROVE',reason:reason(plan,'Duyệt yêu cầu QA; chưa phải completed')})
  await ops.run(manager,'execute-topup-reversal','POST',`/approvals/${approvalId}/execute`,{reason:reason(plan,'Thực thi đảo toàn phần qua workflow được cấp quyền')})
  const after=await client.get(accountant,`/finance/students/${student.id}`)
  if(after.balanceVnd!=='1000000')throw Error('WALLET_BALANCE_NOT_RECONCILED')
  console.log('DEMO_R10_CG: wallet receipt/reversal ledger reconciled')
}
async function verify(plan,client){
  const evidence={screens:[],rbac:[],blockers:plan.blockers}
  const from=new Date(`${plan.referenceDate}T00:00:00+07:00`).toISOString(),to=new Date(Date.parse(from)+8*86400_000).toISOString()
  const calendar=`/scheduling/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&pageSize=100`
  for(const t of plan.baseline.tenants){
    const manager=await client.session(managerEmail(t),t.id)
    for(const [screen,path] of [['G01','/portal/overview'],['OP01','/members'],['BL03','/billing/periods'],['BL07','/billing/invoices'],['SC01',calendar]]){
      const response=await client.get(manager,path)
      evidence.screens.push({tenant:t.code,screen,path,status:screen==='BL07'?'LIST_VERIFIED_DETAIL_BLOCKED_NO_ISSUED_SOURCE':'VERIFIED_API',response:redact(response)})
    }
  }
  const t=plan.baseline.tenants.find(t=>t.code==='DEMO_R10_CG')
  for(const [role,path,expected] of [['teacher','/teaching/assignments',200],['teacher','/portal/teacher-sessions',200],['teacher','/portal/context',200],['student','/my/assignments',200],['parent','/portal/context',200],['academic','/academic/students',200],['accountant','/billing/periods',200],['student','/grading/queue',200],['parent','/members',403],['teacher','/finance/students',403]]){
    const session=await client.session(`${role}.cg@educore.invalid`,t.id)
    let status=200,response;try{response=await client.get(session,path)}catch(e){status=e.status??0}
    if(role==='student'&&path==='/grading/queue'&&status===200&&response.items?.length!==0)throw Error('STUDENT_GRADING_QUEUE_SCOPE_LEAK')
    evidence.rbac.push({role,path,expected,status})
    if(status!==expected)throw Error(`RBAC_UNEXPECTED:${role}:${path}:${status}`)
  }
  const student=await client.session('student.cg@educore.invalid',t.id)
  const studentAssignments=await client.get(student,'/my/assignments')
  const own=studentAssignments.items.filter(a=>a.title.startsWith('R11 ·'))
  if(own.length!==4||own.filter(a=>a.score==='8.5').length!==1||own.filter(a=>a.score!==null&&a.score!==undefined).length!==1)throw Error('UNPUBLISHED_GRADE_VISIBILITY_FAILURE')
  if(plan.scale==='Bulk'){
    const bulk=studentAssignments.items.filter(a=>a.title.startsWith('R11B ·'))
    if(bulk.length!==32||bulk.filter(a=>a.score!==null&&a.score!==undefined).length!==8)throw Error('BULK_UNPUBLISHED_GRADE_VISIBILITY_FAILURE')
  }
  let cross=200;try{await client.request('GET',`/api/v1/tenants/${targets.DEMO_R10_HD}/academic/students`,undefined,student)}catch(e){cross=e.status??0}
  evidence.rbac.push({role:'student',path:'other-tenant/academic/students',expected:403,status:cross});if(cross!==403)throw Error('CROSS_TENANT_DENIAL_FAILED')
  let anonymous=200;try{await client.request('GET',`/api/v1/tenants/${t.id}/members`)}catch(e){anonymous=e.status??0}
  evidence.rbac.push({role:'anonymous',expected:401,status:anonymous});if(anonymous!==401)throw Error('UNAUTHENTICATED_DENIAL_FAILED')
  return evidence
}
async function main(){
  const [mode,inputPath]=process.argv.slice(2),input=validateInput(read(inputPath),mode==='apply'||mode==='verify')
  const path=resolve(input.directory,'plan.json')
  if(mode==='preflight'){
    save(resolve(input.directory,'audit-latest.json'),input.audit)
    console.log(JSON.stringify({database:input.config.database,branch:input.source.branch,migrations:input.audit.migrations.length,tenants:input.audit.tenants.map(t=>({code:t.code,students:t.counts.student_profiles,teachers:t.counts.teacher_profiles,statuses:t.statuses,invalidPolicies:t.policies.filter(p=>!p.valid).map(p=>p.version)}))},null,2));return
  }
  if(mode==='plan'){
    if(existsSync(path)){const original=read(path);if(original.source.commit!==input.source.commit||original.config.database!==input.config.database||original.referenceDate!==input.referenceDate||(original.scale??'Representative')!==(input.scale??'Representative'))throw Error('EXISTING_PLAN_INCOMPATIBLE');console.log('Pinned plan retained; no changes.');return}
    if(input.scale==='Bulk'){
      const basePath=resolve(input.root,'.local/r11/R11_20261028/plan.json'),completedPath=resolve(input.root,'.local/r11/R11_20261028/completed.json')
      if(!existsSync(basePath)||!existsSync(completedPath))throw Error('VERIFIED_REPRESENTATIVE_COHORT_REQUIRED')
      const base=read(basePath);compareHistory(base.baseline,input.audit)
      if(base.config.database!==input.config.database||input.audit.tenants.some(t=>t.counts.class_sessions!==100||t.counts.assignments!==(t.code==='DEMO_R10_CG'?25:20)))throw Error('BULK_BASELINE_REQUIRES_REVIEW')
    }else if(input.audit.tenants.some(t=>t.counts.class_sessions!==96||t.counts.assignments!==20||t.counts.wallet_transactions!==0))throw Error('NON_BASELINE_OR_PARTIAL_COHORT_REQUIRES_REVIEW')
    save(path,createPlan(input));console.log(`Review plan: ${path}`);return
  }
  if(!existsSync(path))throw Error('PLAN_REQUIRED')
  let plan=read(path)
  if(plan.source.commit!==input.source.commit||plan.config.database!==input.config.database||(plan.scale??'Representative')!==(input.scale??'Representative'))throw Error('PLAN_IDENTITY_MISMATCH')
  compareHistory(plan.baseline,input.audit)
  if(mode==='reconcile'){
    const after=read(resolve(input.directory,'after.json'));compareHistory(plan.baseline,after)
    save(resolve(input.directory,'reconciliation.json'),{status:'PASS',originalHistoryUnchanged:true,tenants:after.tenants.map(t=>({code:t.code,before:plan.baseline.tenants.find(b=>b.id===t.id).counts,after:t.counts,statuses:t.statuses,walletMismatch:t.walletMismatch,badMemberLinks:t.badMemberLinks}))})
    console.log('Original R10 histories and IAM grants unchanged; counts/ledger reconciled.');return
  }
  if(!['apply','verify'].includes(mode))throw Error('UNSUPPORTED_MODE')
  if(mode==='apply'&&plan.activationPending){
    if(existsSync(resolve(input.directory,'journal.json')))throw Error('PARTIAL_COHORT_WITH_UNACTIVATED_PLAN')
    plan={...createPlan(input),baseline:plan.baseline,createdAt:plan.createdAt,activationPending:false,activatedAt:new Date().toISOString()}
    save(path,plan)
  }
  const client=new Client(input),ops=new Operations(input,plan,client)
  try{
    if(mode==='apply'){
      const completed=existsSync(resolve(input.directory,'completed.json'))
      if(completed){const receipt=read(resolve(input.directory,'completed.json'));if(receipt.batch!==plan.batch||receipt.planHash!==sha(canonical(plan)))throw Error('COMPLETION_RECEIPT_MISMATCH')}
      if(!completed){await schedules(input,plan,client,ops);await learning(plan,client,ops);if(plan.scale!=='Bulk'){await people(plan,client,ops);await attendance(plan,client,ops);await wallet(plan,client,ops)}}
      else console.log('Completed cohort retained; verifying real API without duplicate business writes.')
    }
    const evidence=await verify(plan,client)
    save(resolve(input.directory,'api-evidence.json'),evidence)
    const finalStep=ops.journal.operations[`${targets.DEMO_R10_CG}:${plan.scale==='Bulk'?`assignment:${plan.assignments.at(-1).label}`:'execute-topup-reversal'}`]
    if(mode==='apply'||finalStep?.status==='COMMITTED')save(resolve(input.directory,'completed.json'),{batch:plan.batch,planHash:sha(canonical(plan)),completedAt:new Date().toISOString()})
  }finally{await client.close();save(resolve(input.directory,'requests.json'),client.evidence)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){main().catch(error=>{console.error(error.message);process.exitCode=1})}
