import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createRoomServer } from '../server.mjs';
import { credentials } from '../nexconn.mjs';
import { approved,diagnostic } from '../public/excerpt.mjs';
import { fileStore } from '../storage.mjs';

const line="Cannot find module './prcing.mjs'";
test('excerpt discards credentials, assignments, URLs, private logs and appended text',()=>{
  for(const privateLine of ['TOKEN=sample-only','export DB_URL=example','Authorization: Bearer test-value',
    '-----BEGIN PRIVATE KEY-----','inside sales notes',"Cannot find module 'https://private.example'"]) assert.equal(diagnostic(privateLine),null);
  assert.equal(diagnostic(line+' while running user-specific command'),line);
  assert.ok(approved([line]));assert.equal(approved(['TOKEN=sample-only']),false);
});
test('token exchange signs exactly the documented regional request and validates the identity',async()=>{
  const env={NEXCONN_APP_KEY:'fixture-key',NEXCONN_APP_SECRET:'fixture-secret',NEXCONN_API_BASE:'https://api.sg-light-api.com'};
  const identity='user123';
  const token=await credentials(env,identity,'peer456','owner',async(url,opts)=>{
    assert.equal(url,env.NEXCONN_API_BASE+'/v4/auth/access-token/issue');
    assert.equal(opts.headers.Signature,createHash('sha1').update(env.NEXCONN_APP_SECRET+opts.headers.Nonce+opts.headers.Timestamp).digest('hex'));
    assert.deepEqual(JSON.parse(opts.body),{userId:identity,name:'Developer'});
    return Response.json({code:0,result:{userId:identity,accessToken:'fixture-user-token'}});
  });
  assert.deepEqual(token,{appKey:'fixture-key',area:'SG',self:identity,peer:'peer456',token:'fixture-user-token'});
  await assert.rejects(()=>credentials({},identity,'peer456','owner'));
});
test('two seats, isolation, pinned reply, failed then successful rebuild, restart and invalid invite',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'forze-room-test-'));
  let server,base;
  async function listen(){
    server=createRoomServer({ROOM_DATA_DIR:dir});
    server.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;
  }
  async function stop(){const done=once(server,'close');server.close();server.closeAllConnections();await done;}
  await listen();t.after(async()=>{await stop();rmSync(dir,{recursive:true,force:true});});
  const request=async(path,body,cookie)=>{
    const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
    return {status:r.status,body:await r.json(),seat:r.headers.get('set-cookie')?.split(';')[0]};
  };
  const spec={source:'sample',lines:[line],envs:['SHOULD_NEVER_PERSIST'],logs:['SECRET_EXTRA']};
  const first=await request('/api/rooms',spec),second=await request('/api/rooms',spec);
  assert.equal(first.status,201);
  const path='/api/rooms/'+first.body.id;
  const invoke=(suffix,body,seat=first.seat)=>request(path+suffix,body,seat);
  assert.equal((await invoke('',undefined,second.seat)).status,403);
  const invite=(await invoke('/invite',{})).body.invite;
  assert.equal((await request(path+'/join',{invite:'expired'})).status,403);
  const joined=await request(path+'/join',{invite});assert.equal(joined.status,200);
  assert.equal((await request(path+'/join',{invite})).status,403);
  const guest=joined.seat, guestView=await invoke('',undefined,guest);
  assert.deepEqual(guestView.body.lines,[line]);assert.equal(guestView.body.role,'guest');
  assert.equal((await invoke('/solution',{},guest)).status,403);
  assert.equal((await invoke('/sample-run',{module:'./pricing.mjs'},guest)).status,403);
  assert.equal((await invoke('/chat',{},guest)).status,503);
  const storage=readFileSync(join(dir,first.body.id+'.json'),'utf8');
  for(const value of ['SHOULD_NEVER_PERSIST','SECRET_EXTRA',invite,first.seat.split('=')[1]])assert.ok(!storage.includes(value));
  const actor=JSON.parse(storage).guestId;
  assert.equal((await invoke('/solution',{messageId:'msg-1',sender:actor,text:'Use ./pricing.mjs'})).status,200);
  assert.equal((await invoke('',undefined,guest)).body.rerun,null);
  await invoke('/sample-run',{module:'./prcing.mjs'});
  assert.equal((await invoke('',undefined,guest)).body.rerun.state,'ERROR');
  await invoke('/sample-run',{module:'./pricing.mjs'});
  await stop();await listen();
  const reopened=(await invoke('',undefined,guest)).body;
  assert.equal(reopened.rerun.state,'READY');assert.equal(reopened.solution.text,'Use ./pricing.mjs');
  const artifact=await fetch(base+path+'/artifact',{headers:{Cookie:guest}});
  assert.equal(artifact.status,200);assert.match(await artifact.text(),/Notebook · \$12/);
  assert.ok(!(await request('/api/rooms/'+second.body.id,undefined,second.seat)).body.solution);
});
test('simultaneous room state changes detect a stale version',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'forze-versions-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const store=fileStore(dir);await store.save({id:'unit'});
  const a=await store.load('unit'),b=await store.load('unit');await store.save(a);await assert.rejects(()=>store.save(b),/changed/);
});
