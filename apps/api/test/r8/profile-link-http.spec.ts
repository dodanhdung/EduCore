import { describe, expect, it, vi } from 'vitest';
import { AcademicProfileController } from '../../src/academic/academic-profile.controller.js';
import type { AuthService } from '../../src/identity-access/auth.service.js';
const tenant='11111111-1111-4111-8111-111111111111',profile='22222222-2222-4222-8222-222222222222',member='33333333-3333-4333-8333-333333333333';
const input={membershipId:member,expectedMembershipId:null,reason:'Synthetic association',confirmed:true};
function controller(){
  const query=vi.fn().mockResolvedValue([{result:{profileId:profile,membershipId:member}}]);
  const transaction=vi.fn(async(_token:string,action:(tx:unknown)=>Promise<unknown>)=>action({$queryRawUnsafe:query}));
  return{controller:new AcademicProfileController({repository:{transaction}} as unknown as AuthService),query,transaction};
}
describe('profile-link HTTP boundary only; authorization tested in native PostgreSQL',()=>{
  for(const kind of ['teachers','students'])it(`binds ${kind} link to fixed SQL and server token transaction`,async()=>{
    const c=controller();
    await c.controller.linkMembership(tenant,kind,profile,input,'review-key','Bearer opaque',{query:{}} as never);
    expect(c.transaction).toHaveBeenCalledWith('opaque',expect.any(Function));
    expect(c.query).toHaveBeenCalledWith(expect.stringContaining('educore_r4.profile_membership_link'),tenant,
      kind==='teachers'?'TEACHER':'STUDENT',profile,JSON.stringify({...input,key:'review-key'}));
  });
  it('rejects mutation scope/query confusion and malformed/extra input before dispatch',()=>{
    const c=controller();
    for(const invalid of [{...input,confirmed:false},{...input,expectedMembershipId:member},{...input,reason:''},
      {...input,membershipId:'bad'},{...input,operation:'UNLINK'}, {membershipId:member,reason:'test',confirmed:true}])
      expect(()=>c.controller.linkMembership(tenant,'students',profile,invalid,'key','Bearer opaque',{query:{}} as never)).toThrow();
    for(const key of [undefined,'', ' '.repeat(3),'x'.repeat(201)])
      expect(()=>c.controller.linkMembership(tenant,'students',profile,input,key,'Bearer opaque',{query:{}} as never)).toThrow();
    expect(()=>c.controller.linkMembership(tenant,'parents',profile,input,'key','Bearer opaque',{query:{}} as never)).toThrow();
    expect(()=>c.controller.linkMembership(tenant,'students',profile,input,'key','Bearer opaque',{query:{role:'MANAGER'}} as never)).toThrow();
    expect(c.transaction).not.toHaveBeenCalled();
  });
});
