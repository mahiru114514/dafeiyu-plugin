import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const { createHost } = await import('../src/index.mjs').catch(() => ({}));
async function setup(initial = [], initialFile, options = {}) {
  assert.equal(typeof createHost, 'function', 'Host plugin adapter must exist');
  const listeners = new Map(), routes = new Map(), cleanups = [];
  let mono = 0, wall = new Date(2026, 9, 11, 12).getTime();
  const testRoot = join(process.cwd(), 'tmp', 'tests');
  await mkdir(testRoot, { recursive: true });
  const stateFile = join(await mkdtemp(join(testRoot, 'harness-pet-')), 'state.json');
  if (initialFile) await writeFile(stateFile, initialFile);
  const ctx = {
    get:name=>name==='sessionProjections'?options.projections:undefined,
    workspaceRegistry:{list:()=>options.workspaces??[]},
    sessions: {get:id=>initial.find(a=>a.session.id===id)?.session},
    agents: { list: () => initial, roots: () => initial.filter(a => !a.child), isOwnedBy: (id, parent) => initial.some(a => a.id === id && a.child && parent.id === 'root') },
    logger: { warn() {} },
    on(name, fn) { listeners.set(name, fn); return () => listeners.delete(name); },
    effect(fn) { cleanups.push(fn()); },
    connection: { fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } } },
  };
  const host = await createHost(ctx, { stateFile, clock: () => [mono, wall], uptime: () => mono / 1000, timer: false, ...options });
  return { host, routes, stateFile, listeners, async emit(name, ...args) { return listeners.get(name)?.(...args); },
    step(ms) { mono += ms; wall += ms; host.tick(); },
    async close() { await host.dispose(); for (const cleanup of cleanups.reverse()) await cleanup?.(); } };
}
function agent(id, child = false) { return { id, child, status: 'idle', session: { id } }; }

function projectionsFor(a,events=[],questions=[]) {
  let definition;return {register(def){definition=def;return()=>{definition=null;};},
    stateOf(session,key){if(session!==a.session)return undefined;
      if(key==='userQuestions')return{questions:{active:questions}};
      if(key===definition?.key)return events.reduce((s,e)=>definition.apply(s,e),definition.init({},a.session.inheritedEventCount??0));},
  };
}
test('enabling mid-run recovers current approvals and open/continued questions without ended or inherited approvals',async()=>{
  const a=agent('a');a.status='running';a.session.inheritedEventCount=2;
  const events=[['turn/start',{}],['approval/asked',{id:'inherited'}],['turn/start',{}],['approval/asked',{id:'ended'}],['turn/end',{}],['turn/start',{}],['approval/asked',{id:'active'}]].map(([type,data],seq)=>({type,data,seq}));
  const questions=[{callId:'open',state:'open'},{callId:'continued',state:'continued'}];
  const h=await setup([a],undefined,{projections:projectionsFor(a,events,questions)});
  assert.deepEqual(h.host.snapshot().waiting.map(w=>w.key).sort(),['approval:active','question:a:continued','question:a:open']);
  events.push({seq:7,type:'approval/decided',data:{id:'active'}});questions.splice(0);h.step(1000);
  assert.equal(h.host.snapshot().waiting.length,0);await h.close();
});
test('a successful foreground question is not resurrected by a projection awaiting tool commit',async()=>{
  const a=agent('a'),questions=[{callId:'q',state:'open'}];
  const h=await setup([a],undefined,{projections:projectionsFor(a,[],questions)});
  await h.emit('user-questions/request',{agent:a,wait:{callId:'q',timed:true}},async()=>({answers:[]}));
  h.step(1000);assert.equal(h.host.snapshot().waiting.length,0);
  questions.splice(0);h.step(1000);await h.close();
});
test('projection read failure preserves pending waits and running time, then recovers',async()=>{
  const a=agent('a');a.status='running';const questions=[{callId:'q',state:'open'}],projections=projectionsFor(a,[],questions),read=projections.stateOf;
  const h=await setup([a],undefined,{projections});projections.stateOf=()=>{throw Error('projection unavailable');};
  h.step(1000);assert.equal(h.host.snapshot().todayMs,1000);assert.equal(h.host.snapshot().waiting.length,1);assert.match(h.host.snapshot().pendingError,/确认/);
  projections.stateOf=read;questions.splice(0);h.step(1000);assert.equal(h.host.snapshot().waiting.length,0);assert.equal(h.host.snapshot().pendingError,'');await h.close();
});
test('only timed NO_PROVIDER questions remain answerable until the official late reply',async()=>{
  const a=agent('a'),h=await setup([a]),error=Object.assign(new Error('no UI'),{code:'NO_PROVIDER'});
  for(const timed of [true,false])await assert.rejects(h.emit('user-questions/request',{agent:a,wait:{callId:timed?'timed':'blocking',timed}},async()=>{throw error;}),e=>e===error);
  assert.deepEqual(h.host.snapshot().waiting.map(w=>w.key),['question:a:timed']);
  await h.emit('session/event',a.session,{type:'user/message',data:{source:{kind:'user-question-reply',callId:'timed'}}});
  assert.equal(h.host.snapshot().waiting.length,0);await h.close();
});

test('an action whose body arrives after disposal cannot mutate settings or invoke tools',async()=>{
  const a=agent('a');a.session.header={cwd:'E:\\project'};let opens=0;
  const h=await setup([a],undefined,{folderOpener:{supported:true,open:async()=>{opens++;return{};},dispose(){}}});
  const route=h.routes.get('/api/harness-pet/action');let deliver;
  const response=route.fetch({text:()=>new Promise(r=>deliver=r)});await h.close();
  deliver(JSON.stringify({type:'configure',patch:{quiet:true}}));assert.equal((await response).status,400);assert.equal(h.host.snapshot().settings.quiet,false);
  const after=await route.fetch({text:async()=>JSON.stringify({type:'open-workspace',sessionId:'a'})});assert.equal(after.status,400);assert.equal(opens,0);
});

test('open workspace uses registered ownership or trusted cwd and ignores client directory',async()=>{
  const a=agent('current');a.session.header={cwd:'E:\\project'};const calls=[];
  const folderOpener={supported:true,open:async root=>{calls.push(root);return{folderPath:root};},dispose(){}};
  const workspace={sessionIds:['current'],path:'E:\\workspace'},h=await setup([a],undefined,{folderOpener,workspaces:[workspace]});
  const route=h.routes.get('/api/harness-pet/action');const invoke=body=>route.fetch(new Request('http://localhost/api/harness-pet/action',{method:'POST',body:JSON.stringify(body)}));
  const opened=await invoke({type:'open-workspace',sessionId:'current',path:'E:\\untrusted'});assert.equal(opened.status,200);
  assert.equal((await opened.json()).folderResult.folderPath,'E:\\workspace');assert.deepEqual(calls,['E:\\workspace']);
  workspace.sessionIds=[];assert.equal((await invoke({type:'open-workspace',sessionId:'current'})).status,200);assert.equal(calls.at(-1),'E:\\project');
  assert.equal((await invoke({type:'open-workspace',sessionId:'missing'})).status,400);assert.equal(calls.length,2);await h.close();
});

test('project actions resolve trusted session cwd and refuse arbitrary client paths',async()=>{
  const a=agent('current');a.session.header={cwd:'E:\\project'};const calls=[];
  const portManager={supported:true,scanProject:async root=>{calls.push(root);return{projectPath:root,owners:[]};},terminateProject:async(root,token)=>{calls.push([root,token]);return{projectPath:root,owners:[]};},dispose(){}};
  const h=await setup([a],undefined,{portManager}),route=h.routes.get('/api/harness-pet/action');
  const invoke=body=>route.fetch(new Request('http://localhost/api/harness-pet/action',{method:'POST',body:JSON.stringify(body)}));
  assert.equal((await invoke({type:'scan-project',projectPath:'E:\\other'})).status,400);
  const good=await invoke({type:'scan-project',sessionId:'current',projectPath:'E:\\other'});assert.equal(good.status,200);
  assert.equal((await good.json()).portInspection.sessionId,'current');assert.deepEqual(calls,['E:\\project']);
  assert.equal((await invoke({type:'release-project',sessionId:'current',token:'cap'})).status,200);
  a.session.header.cwd=undefined;assert.equal((await invoke({type:'scan-project',sessionId:'current'})).status,400);await h.close();
});

test('legacy arbitrary-port routes are disabled and the project manager is disposed',async()=>{
  const calls=[];let disposed=false;
  const portManager={supported:true,async inspect(port){calls.push(['inspect',port]);return{port,owners:[]};},async terminate(token){
    if(token!=='issued-token')throw Error('进程列表已失效');calls.push(['terminate',token]);return{port:5173,owners:[],message:'已释放'};},dispose(){disposed=true;}};
  const h=await setup([],undefined,{portManager});
  const route=h.routes.get('/api/harness-pet/action');
  const invoke=body=>route.fetch(new Request('http://localhost/api/harness-pet/action',{method:'POST',body:JSON.stringify(body)}));
  const result=await invoke({type:'inspect-port',port:5173});assert.equal(result.status,400);
  assert.equal((await invoke({type:'terminate-port',pid:1234})).status,400);
  const ended=await invoke({type:'terminate-port',token:'issued-token'});assert.equal(ended.status,400);
  assert.deepEqual(calls,[]);
  await h.close();assert.equal(disposed,true);
});
test('startup clock advances while idle without adding Agent runtime', async () => {
  const h = await setup();
  assert.equal(h.host.snapshot().startupElapsedMs, 0);
  h.step(10000);
  assert.equal(h.host.snapshot().startupElapsedMs, 10000);
  assert.equal(h.host.snapshot().todayMs, 0);
  await h.close();
});
test('Host observes formal running events, completion, cancellation and removes registrations', async () => {
  const a = agent('root'); const h = await setup([a]);
  await h.emit('agent/status', { agent: a, status: 'running' }); h.step(1000);
  await h.emit('session/event', a.session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
  await h.emit('agent/status', { agent: a, status: 'idle' });
  assert.equal(h.host.state.snapshot().todayMs, 1000);
  assert.equal(h.host.state.snapshot().notices[0].kind, 'complete');
  await h.emit('agent/status', { agent: a, status: 'running' });
  await h.emit('session/event', a.session, { type: 'turn/end', data: { turn: 2, reason: { kind: 'aborted', reason: {kind:'user'} } } });
  await h.emit('agent/status', { agent: a, status: 'idle' });
  assert.equal(h.host.state.snapshot().notices.length, 2);
  assert.equal(h.host.state.snapshot().notices[1].kind, 'cancel');
  await h.close(); assert.equal(h.routes.size, 0); assert.equal(h.listeners.size, 0);
  assert.equal(JSON.parse(await readFile(h.stateFile)).version, 1);
});

test('Host distinguishes failures from aborted turns and duplicate idle cannot replay either', async () => {
  const a=agent('root'), h=await setup([a]); let turn=0;
  for (const kind of ['error','max-tokens','blocked','aborted']) {
    await h.emit('agent/status',{agent:a,status:'running'});
    await h.emit('session/event',a.session,{type:'turn/end',data:{turn:++turn,reason:{kind,...(kind==='aborted'?{reason:{kind:'user'}}:{})}}});
    await h.emit('agent/status',{agent:a,status:'idle'});
    await h.emit('agent/status',{agent:a,status:'idle'});
  }
  assert.deepEqual(h.host.snapshot().notices.map(n=>n.kind),['error','error','error','cancel']);
  await h.close();
});

test('only explicit user cancellation shows the stopped pose; internal aborts are silent', async () => {
  const a=agent('root'), h=await setup([a]); let turn=0;
  for (const cause of ['parent','disposed','hook',undefined]) {
    await h.emit('agent/status',{agent:a,status:'running'});
    await h.emit('session/event',a.session,{type:'turn/end',data:{turn:++turn,reason:{kind:'aborted',...(cause?{reason:{kind:cause}}:{})}}});
    await h.emit('agent/status',{agent:a,status:'idle'});
  }
  assert.equal(h.host.snapshot().notices.length,0);
  await h.close();
});
test('baseline running never replays completion and child completion is quiet', async () => {
  const a = agent('child', true); a.status = 'running'; const h = await setup([a]);
  assert.equal(h.host.state.snapshot().notices.length, 0); h.step(1000);
  await h.emit('session/event', a.session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } });
  await h.emit('agent/status', { agent: a, status: 'idle' });
  assert.equal(h.host.state.snapshot().notices.length, 0); await h.close();
});
test('approval observes audit events; answer is still performed by official UI', async () => {
  const a = agent('root'), h = await setup([a]);
  const asked = { type: 'approval/asked', data: { id: 'request1', toolName: 'bash' } };
  await h.emit('session/event', a.session, asked); await h.emit('session/event', a.session, asked);
  assert.equal(h.host.state.snapshot().waiting.length, 1); assert.equal(h.host.state.snapshot().notices.length, 1);
  await h.emit('session/event', a.session, { type: 'approval/decided', data: { id: 'request1', outcome: 'allowed-once' } });
  assert.equal(h.host.state.snapshot().waiting.length, 0); await h.close();
});
test('question wrapper delegates unchanged and settles answered waits', async () => {
  const a = agent('root'), h = await setup([a]); let answer;
  const promise = h.emit('user-questions/request', { agent: a, wait: { callId: 'q1' } }, () => new Promise(r => { answer = r; }));
  assert.equal(h.host.state.snapshot().waiting.length, 1); answer({ answers: [] });
  assert.deepEqual(await promise, { answers: [] }); assert.equal(h.host.state.snapshot().waiting.length, 0); await h.close();
});
test('authenticated route rejects unknown actions and invalid settings', async () => {
  const h = await setup(); const route = h.routes.get('/api/harness-pet/action');
  const invoke = body => route.fetch(new Request('http://localhost/api/harness-pet/action', { method: 'POST', body: JSON.stringify(body) }));
  assert.equal((await invoke({ type: 'configure', patch: { waterMinutes: 1 } })).status, 200);
  assert.equal((await invoke({ type: 'configure', patch: { volume: 50 } })).status, 400);
  assert.equal((await invoke({ type: 'approve', id: 'r1' })).status, 400);
  const response = await h.routes.get('/api/harness-pet/state').fetch(new Request('http://localhost/api/harness-pet/state'));
  assert.equal(response.headers.get('cache-control'), 'no-store'); await h.close();
});
test('unreadable saved statistics are preserved and reported instead of overwritten', async () => {
  const h = await setup([], '{broken'); h.step(1000);
  assert.match(h.host.snapshot().storageError, /统计/); await h.close();
  assert.equal(await readFile(h.stateFile, 'utf8'), '{broken');
});
test('disposing a child leaves its parent approval pending', async () => {
  const root = agent('root'), child = agent('child', true), h = await setup([root, child]);
  await h.emit('session/event', root.session, { type: 'approval/asked', data: { id: 'parent-approval' } });
  await h.emit('agent/disposed', { agent: child });
  assert.equal(h.host.snapshot().waiting.length, 1);
  await h.emit('agent/disposed', { agent: root });
  assert.equal(h.host.snapshot().waiting.length, 0); await h.close();
});
test('timed question remains pending and official reply resolves it', async () => {
  const a = agent('root'), h = await setup([a]);
  const error = Object.assign(new Error('timeout'), { code: 'ASK_TIMED_OUT' });
  await assert.rejects(h.emit('user-questions/request', { agent: a, wait: { callId: 'timed' } }, async () => { throw error; }), e => e === error);
  assert.equal(h.host.snapshot().waiting.length, 1);
  await h.emit('session/event', a.session, { type: 'user/message', data: { source: { kind: 'user-question-reply', callId: 'timed' } } });
  assert.equal(h.host.snapshot().waiting.length, 0); await h.close();
});
