import fs from 'node:fs';

// Intentionally no network, subprocess, credential, OTP or live execution path.
// A valid manifest is a review plan; it cannot authorize live provisioning.
const file=process.argv[2];
if(!file||process.argv.length!==3)throw Error('ONE_MANIFEST_PATH_REQUIRED');
const manifest=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const tenant='6cd3b33a-5eaa-41a8-9ae5-12755799e631';
const accounts=manifest.accounts;
if(!Array.isArray(accounts)||accounts.length!==8||new Set(accounts.map(a=>a.alias)).size!==8)throw Error('EXACT_EIGHT_UNIQUE_ACCOUNTS_REQUIRED');
const expected={ACADEMIC_STAFF:1,ACCOUNTANT:1,TEACHER:2,STUDENT:2,PARENT:2};
if(accounts.some(a=>a.tenant!==tenant||!Object.hasOwn(expected,a.role)))throw Error('TENANT_OR_ROLE_MISMATCH');
for(const[role,count]of Object.entries(expected))if(accounts.filter(a=>a.role===role).length!==count)throw Error('ROLE_COUNT_MISMATCH');
if(!manifest.reuseManager||manifest.liveExecutionEnabled!==false)throw Error('REVIEW_ONLY_MANIFEST_REQUIRED');
const emails=accounts.filter(a=>typeof a.email==='string').map(a=>a.email.trim().toLowerCase());
if(new Set(emails).size!==emails.length)throw Error('DUPLICATE_CONTROLLED_INBOX');
const blockers=[];
for(const gate of ['otpSecurityVerified','smtpVerified','maintenanceVerified','releaseTupleVerified','profileLinkContractApproved'])
  if(manifest.gates?.[gate]!==true)blockers.push(gate);
for(const account of accounts){
  if(!account.email||account.inboxOwned!==true)blockers.push(`${account.alias}:controlled-inbox`);
  else if(typeof account.email!=='string'||!/^\S+@\S+\.\S+$/.test(account.email)||/@[^@]*invalid$/i.test(account.email))throw Error('INVALID_CONTROLLED_INBOX');
  if(['STUDENT','TEACHER'].includes(account.role)&&!account.profileRef)throw Error('PROFILE_REFERENCE_REQUIRED');
  if(!['TENANT','CLASS','STUDENT'].includes(account.scope))throw Error('SCOPE_REQUIRED');
}
console.log(JSON.stringify({mode:'OFFLINE_DRY_RUN',liveExecutionEnabled:false,accounts:8,roleCounts:expected,
  planStructure:'PASS',readiness:blockers.length?'BLOCKED':'REVIEW_READY_ONLY',blockers},null,2));
