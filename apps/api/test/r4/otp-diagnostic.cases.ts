import { AsyncLocalStorage, createHook } from 'node:async_hooks';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import request from 'supertest';
import type postgres from 'postgres';
import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import type { AuthService } from '../../src/identity-access/auth.service.js';
import type { R4Repository } from '../../src/identity-access/r4-repository.js';
import { RecoveryWorker } from '../../src/identity-access/recovery-worker.js';
import type { parseRecoveryKey } from '../../src/identity-access/recovery-envelope.js';

type Span = { kind:string; ms:number; waiting?:number; total?:number; idle?:number };
type Trace = { index:number; cell:string; block:number; known:boolean; clientMs?:number;
  serverStart?:number; serverMs?:number; floorRegistered?:number; floorCallback?:number;
  responseOverDeadlineMs?:number; issueOverDeadlineMs?:number; issueStart?:number; issueEnd?:number;
  issuanceAccepted?:boolean; spans:Span[] };
type DriverClient = { query:(...args:unknown[])=>unknown };
type DriverPool = { options:{max:number}; waitingCount:number;totalCount:number;idleCount:number;
  connect:(...args:unknown[])=>unknown;on:(event:string,listener:(client:DriverClient)=>void)=>void;end:()=>Promise<void> };
type Context = {admin:()=>postgres.Sql;app:()=>INestApplication;auth:()=>AuthService;repository:()=>R4Repository;
  authUrl:()=>string;workerDb:()=>PrismaClient;key:()=>ReturnType<typeof parseRecoveryKey>;
  evidence:Record<string,unknown>};

/** Explicit opt-in diagnostic. Never an acceptance test or an automatic retry.
 * The official C03 estimator, sample size and gates remain untouched. */
export function registerOtpDiagnostic(ctx:Context) {
  if(process.env.R13_OTP_DIAGNOSTIC!=='PREREGISTERED_LOCAL_D1')return;
  it('R13 OTP preregistered diagnostic D1',async()=>{
    const plan=JSON.parse(readFileSync(resolve('../../.local/r13-b0-complete/otp-preregistration.json'),'utf8').replace(/^\uFEFF/,''));
    expect(plan.diagnosticRuns).toBe(1);expect(plan.diagnosticBlocksPerCell).toBe(20);
    expect(process.env.R4_TEST_DISPOSABLE).toBe('I_OWN_THIS_DISPOSABLE_CLUSTER');
    const application=ctx.app(),auth=ctx.auth(),repository=ctx.repository();
    const token=randomBytes(5).toString('hex');
    const address=(known:boolean,n:number)=>`d1${known?'k':'u'}${token}${String(n).padStart(4,'0')}@r4.invalid`;
    await ctx.admin()`INSERT INTO users(id,email_normalized,display_name,status,updated_at)
      SELECT gen_random_uuid(),'d1k'||${token}||lpad(g::text,4,'0')||'@r4.invalid','Diagnostic synthetic','ACTIVE',clock_timestamp()
      FROM generate_series(0,499) g`;
    application.getHttpAdapter().getInstance().set('trust proxy','loopback');
    if(!application.getHttpServer().address())await application.listen(0,'127.0.0.1');
    const origin=`http://127.0.0.1:${application.getHttpServer().address().port}`;
    const store=new AsyncLocalStorage<Trace>(), traces=new Map<number,Trace>(), timerTrace=new Map<number,Trace>();
    let sequence=0;
    const onRequest=(req:IncomingMessage,res:ServerResponse)=>{
      const index=Number(req.headers['x-r13-diagnostic']);
      const trace=traces.get(index);if(!trace)return;
      store.enterWith(trace);trace.serverStart=performance.now();
      res.once('finish',()=>{const now=performance.now();trace.serverMs=now-trace.serverStart!;
        if(trace.floorRegistered!==undefined)trace.responseOverDeadlineMs=now-trace.floorRegistered-100;});
    };
    const hook=createHook({init(id,type,_trigger,resource){
      const trace=store.getStore();if(trace&&type==='Timeout'&&(resource as {_idleTimeout?:number})._idleTimeout===100){
        trace.floorRegistered=performance.now();timerTrace.set(id,trace);
      }
    },before(id){const trace=timerTrace.get(id);if(trace)trace.floorCallback=performance.now();},destroy(id){timerTrace.delete(id);}});
    const originalIssue=auth.requestOtp.bind(auth);
    auth.requestOtp=async(...args)=>{const trace=store.getStore();if(trace)trace.issueStart=performance.now();
      try{return await originalIssue(...args);}finally{if(trace){trace.issueEnd=performance.now();
        if(trace.floorRegistered!==undefined)trace.issueOverDeadlineMs=trace.issueEnd-trace.floorRegistered-100;}}};

    // Use the installed adapter's actual pg module and its unchanged default
    // pool maximum. No production adapter, driver or credential changes.
    const require=createRequire(import.meta.url);
    const driver=createRequire(require.resolve('@prisma/adapter-pg'))('pg') as {Pool:new(config:unknown)=>DriverPool};
    const pool=new driver.Pool({connectionString:ctx.authUrl(),application_name:'r13_b0_otp_diagnostic'});
    const originalConnect=pool.connect.bind(pool);
    const acquisition=(trace:Trace|undefined,start:number)=>{
      if(trace)trace.spans.push({kind:'pool-acquire',ms:performance.now()-start,waiting:pool.waitingCount,total:pool.totalCount,idle:pool.idleCount});
    };
    pool.connect=(...args:unknown[])=>{
      const trace=store.getStore(),start=performance.now();
      const callback=args[0];
      if(typeof callback==='function')return originalConnect((...result:unknown[])=>{acquisition(trace,start);callback(...result);});
      return (originalConnect() as Promise<DriverClient>).then(client=>{acquisition(trace,start);return client;});
    };
    pool.on('connect',client=>{
      const query=client.query.bind(client);
      client.query=(...args:unknown[])=>{
        const trace=store.getStore(),start=performance.now();
        const command=args[0] as {text?:string};const issuance=command?.text?.includes('request_recovery_otp')??false;
        const record=(result:unknown)=>{
          if(!trace)return;
          trace.spans.push({kind:issuance?'issuance-sql-roundtrip':'auth-sql-roundtrip',ms:performance.now()-start});
          if(issuance){const rows=(result as {rows?:unknown[]})?.rows;const row=rows?.[0];
            const value=Array.isArray(row)?row[0]:(row as {result?:unknown})?.result;
            if(typeof value==='boolean')trace.issuanceAccepted=value;}
        };
        const last=args.at(-1);
        if(typeof last==='function')return query(...args.slice(0,-1),(...values:unknown[])=>{record(values[1]);last(...values);});
        const pending=query(...args) as Promise<unknown>;
        return pending.then(value=>{record(value);return value;});
      };
    });
    const diagnosticClient=new PrismaClient({adapter:new PrismaPg(pool as unknown as ConstructorParameters<typeof PrismaPg>[0])});
    const originalClient=repository.auth;
    Object.defineProperty(repository,'auth',{value:diagnosticClient,configurable:true});
    const loop=monitorEventLoopDelay({resolution:10});
    const sampledWaits:Record<string,number>={};let sampling=true;
    const sampler=(async()=>{while(sampling){
      const rows=await ctx.admin()`SELECT COALESCE(wait_event_type,'RUNNING') kind,count(*)::int n FROM pg_stat_activity
        WHERE application_name='r13_b0_otp_diagnostic' AND state='active' GROUP BY 1`;
      for(const r of rows)sampledWaits[String(r.kind)]=(sampledWaits[String(r.kind)]??0)+Number(r.n);
      await new Promise(r=>setTimeout(r,5));
    }})();
    const nullServer=createServer(async(req,res)=>{
      await new Promise(r=>setTimeout(r,100));
      if(req.headers['x-r13-positive']==='known')await new Promise(r=>setTimeout(r,20));
      res.setHeader('Content-Type','application/json');res.end('{"accepted":true}');
    });
    nullServer.prependListener('request',onRequest);
    application.getHttpServer().prependListener('request',onRequest);
    await new Promise<void>(r=>nullServer.listen(0,'127.0.0.1',r));
    const nullOrigin=`http://127.0.0.1:${(nullServer.address() as {port:number}).port}`;
    hook.enable();loop.enable();
    let random=plan.seed as number;
    const rng=()=>((random=(Math.imul(random,1664525)+1013904223)>>>0)/2**32);
    const cells:Record<string,unknown>={};
    const shape=(r:request.Response)=>JSON.stringify({status:r.status,body:r.text,contentType:r.headers['content-type'],
      cache:r.headers['cache-control'],cookie:r.headers['set-cookie']??null,retry:r.headers['retry-after']??null});
    const call=async(cell:string,block:number,known:boolean,n:number,isNull=false,positive=false)=>{
      const trace:Trace={index:++sequence,cell,block,known,spans:[]};traces.set(trace.index,trace);
      const start=performance.now();
      const response=await request(isNull?nullOrigin:origin).post(isNull?'/null':'/api/v1/auth/password/otp/request')
        .set('X-R13-Diagnostic',String(trace.index)).set('X-Forwarded-For',`198.30.${Math.floor(n/250)}.${n%250}`)
        .set('X-R13-Positive',positive&&known?'known':'blind').send(isNull?{}:{email:address(known,n)});
      trace.clientMs=performance.now()-start;
      expect(response.status).toBe(isNull?200:202);expect(response.body).toEqual({accepted:true});
      return {trace,shape:shape(response)};
    };
    try {
      for(let start=0;start<100;start+=4)await Promise.all(Array.from({length:4},(_,j)=>{
        const i=start+j;return call('warmup',Math.floor(i/8),i%2===0,Math.floor(i/2));}));
      const drain=new RecoveryWorker(ctx.workerDb(),new Map([[ctx.key().id,ctx.key()]]),{send:async()=>'ACCEPTED'});
      while(await drain.tick()!=='IDLE'){/* Excluded planned warmup, no external delivery. */}
      for(const [cellIndex,cell] of [...plan.diagnosticCells,'null-blind','positive-control'].entries()){
        const isNull=cellIndex>=4,positive=cell==='positive-control',concurrency=cell.startsWith('serial')?1:4;
        const workerTimes:number[]=[],sendTimes:number[]=[];const outcomes:Record<string,number>={};let active=true,pumpError:unknown;
        const worker=new RecoveryWorker(ctx.workerDb(),new Map([[ctx.key().id,ctx.key()]]),{send:async()=>{
          const start=performance.now();if(cell.includes('slow-reject'))await new Promise(r=>setTimeout(r,20));
          sendTimes.push(performance.now()-start);return cell.includes('slow-reject')?'TRANSIENT':'ACCEPTED';}});
        const pump=(async()=>{try{while(active&&!isNull){const start=performance.now();const result=await worker.tick();
          workerTimes.push(performance.now()-start);outcomes[result]=(outcomes[result]??0)+1;
          if(result==='IDLE')await new Promise(r=>setTimeout(r,2));}}catch(e){pumpError=e;}})();
        let reference:string|undefined;const rows:Trace[]=[];
        const orders:Array<boolean[]> = [];
        for(let pair=0;pair<10;pair++){
          const order=[true,true,true,true,false,false,false,false];
          for(let i=7;i>0;i--){const j=Math.floor(rng()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
          orders.push(order,order.map(x=>!x));
        }
        try {
          for(let block=0;block<20;block++){
            let k=0,u=0;
            const jobs=orders[block].map(known=>()=>call(cell,block,known,100+cellIndex*80+block*4+(known?k++:u++),isNull,positive));
            for(let start=0;start<8;start+=concurrency){const wave=await Promise.all(jobs.slice(start,start+concurrency).map(fn=>fn()));
              for(const value of wave){reference??=value.shape;expect(value.shape).toBe(reference);rows.push(value.trace);}}
          }
        } finally {active=false;await pump;}
        if(pumpError)throw pumpError;
        cells[cell]={concurrency,rows,worker:{tickMs:workerTimes,sendMs:sendTimes,outcomes}};
      }
      expect(Object.keys(cells)).toHaveLength(6);
      for(const [name,value] of Object.entries(cells)){
        const rows=(value as {rows:Trace[]}).rows;expect(rows).toHaveLength(160);
        expect(rows.filter(r=>r.known)).toHaveLength(80);
        expect(rows.every(r=>r.floorRegistered!==undefined&&r.floorCallback!==undefined&&r.serverMs!==undefined),name).toBe(true);
        if(!name.includes('control')&&!name.startsWith('null'))expect(rows.every(r=>r.spans.some(s=>s.kind==='pool-acquire')&&r.issuanceAccepted===r.known),name).toBe(true);
      }
    } finally {
      sampling=false;await sampler;loop.disable();hook.disable();
      application.getHttpServer().removeListener('request',onRequest);
      auth.requestOtp=originalIssue;Object.defineProperty(repository,'auth',{value:originalClient,configurable:true});
      await diagnosticClient.$disconnect();await pool.end();
      await new Promise<void>((r,reject)=>nullServer.close(e=>e?reject(e):r()));
      // No emails, OTPs, SQL text/parameters, keys or credentials enter evidence.
      const strip=(trace:Trace)=>({index:trace.index,cell:trace.cell,block:trace.block,known:trace.known,
        clientMs:trace.clientMs,serverMs:trace.serverMs,issueMs:trace.issueEnd!==undefined&&trace.issueStart!==undefined?trace.issueEnd-trace.issueStart:undefined,
        floorCallbackLatenessMs:trace.floorCallback!==undefined&&trace.floorRegistered!==undefined?trace.floorCallback-trace.floorRegistered-100:undefined,
        responseOverDeadlineMs:trace.responseOverDeadlineMs,issueOverDeadlineMs:trace.issueOverDeadlineMs,
        issuanceAccepted:trace.issuanceAccepted,spans:trace.spans});
      ctx.evidence.otpDiagnostic={plan,cells:Object.fromEntries(Object.entries(cells).map(([name,value])=>{
        const {rows,...other}=value as {rows:Trace[];worker:unknown;concurrency:number};return[name,{...other,rows:rows.map(strip)}];})),
        partialTraces:[...traces.values()].filter(t=>t.cell!=='warmup').map(strip),poolMaximum:pool.options.max,
        eventLoop:{meanMs:loop.mean/1e6,maxMs:loop.max/1e6,p95Ms:loop.percentile(95)/1e6},sampledPostgresWaits:sampledWaits,
        SQLDurationMeaning:'driver query roundtrip, includes network and DB wait/execution; server CPU alone NOT_MEASURED',
        GCPauseAttribution:'NOT_MEASURED',inference:'DESCRIPTIVE_ONLY_NOT_A_SECURITY_GATE'};
    }
  },180_000);
}
