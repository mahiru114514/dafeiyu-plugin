import test from 'node:test';
import assert from 'node:assert/strict';
const { selectPose, Presence, Outcome,ActionPose,poses } = await import('../src/appearance.cjs').catch(() => ({}));
const pose = patch => selectPose({ waitingCount: 0, runningCount: 0, startupElapsedMs: 300000, foreground: true, idleMs: 0, idleMinutes: 10, ...patch });

test('tools use distinct poses while confirmation and health remain highest priority',()=>{
  for(const actionPose of ['cleanup','folder']) {
    assert.equal(pose({actionPose,runningCount:1,outcomePose:'complete'}),actionPose);
    assert.equal(pose({actionPose,waitingCount:1}),'waiting');
    assert.equal(pose({actionPose,dueCount:1}),'health');
  }
  assert.equal(pose({actionPose:'arbitrary'}),'idle');
  assert.deepEqual(poses.cleanup,{sheet:'tools',rows:2,row:0});assert.deepEqual(poses.folder,{sheet:'tools',rows:2,row:1});
});
test('folder action lasts through launch and ten seconds after success, cleanup resumes or failure clears immediately',()=>{
  assert.equal(typeof ActionPose,'function');let now=0;const action=new ActionPose(()=>now);
  assert.equal(action.pose(true),'cleanup');assert.equal(action.pose(false),null);
  action.startFolder();now=20000;assert.equal(action.pose(true),'folder');
  action.endFolder(true);now+=9999;assert.equal(action.pose(false),'folder');now++;assert.equal(action.pose(true),'cleanup');
  action.startFolder();action.endFolder(false);assert.equal(action.pose(false),null);
  action.startFolder();action.clear();assert.equal(action.pose(false),null);
});
test('welcome lasts first five minutes of each process, then hungry idle', () => {
  assert.equal(typeof selectPose, 'function');
  assert.equal(pose({startupElapsedMs:0}), 'welcome');
  assert.equal(pose({startupElapsedMs:299999}), 'welcome');
  assert.equal(pose({startupElapsedMs:300000}), 'idle');
});
test('foreground idle sleeps at ten minutes; background does not sleep', () => {
  assert.equal(pose({idleMs:599999}), 'idle');
  assert.equal(pose({idleMs:600000}), 'sleep');
  assert.equal(pose({foreground:false,idleMs:3600000}), 'idle');
  assert.equal(pose({idleMinutes:2,idleMs:120000}), 'sleep');
});
test('waiting and working override welcome and inactivity', () => {
  assert.equal(pose({runningCount:1, startupElapsedMs:1, idleMs:3600000}), 'working');
  assert.equal(pose({waitingCount:1,runningCount:2,startupElapsedMs:1,idleMs:3600000}), 'waiting');
});
test('health reminder overrides running but waiting for confirmation remains first', () => {
  assert.equal(pose({dueCount:2,runningCount:1,startupElapsedMs:1,idleMs:3600000}), 'health');
  assert.equal(pose({dueCount:1,runningCount:1,waitingCount:1}), 'waiting');
  assert.equal(pose({dueCount:1,foreground:false}), 'health');
});
test('partial health acknowledgement stays visible; clearing all restores the current activity', () => {
  assert.equal(pose({dueCount:2,runningCount:1}), 'health');
  assert.equal(pose({dueCount:1,runningCount:1}), 'health');
  assert.equal(pose({dueCount:0,runningCount:1}), 'working');
  assert.equal(pose({dueCount:0}), 'idle');
});
test('presence observes only foreground inactivity and activity wakes it', () => {
  assert.equal(typeof Presence, 'function');
  let now=0; const p=new Presence(()=>now, true);
  now=600000; assert.equal(p.snapshot().idleMs,600000);
  p.activity(); assert.equal(p.snapshot().idleMs,0);
  now+=300000; p.focus(false); now+=3600000;
  assert.equal(p.snapshot().idleMs,0);
  p.focus(true); assert.equal(p.snapshot().idleMs,0);
  now+=600000; assert.equal(p.snapshot().idleMs,600000);
});

test('completion briefly overrides working and idle; confirmation and health stay first', () => {
  assert.equal(pose({outcomePose:'complete',runningCount:1}), 'complete');
  assert.equal(pose({outcomePose:'complete',idleMs:600000}), 'complete');
  assert.equal(pose({outcomePose:'complete',waitingCount:1}), 'waiting');
  assert.equal(pose({outcomePose:'complete',dueCount:1}), 'health');
});

test('completion observes new successful notices once and expires at twenty seconds', () => {
  let now=0; const c=new Outcome(()=>now);
  const state={generation:'g1',cursor:1,runningCount:1,notices:[{id:1,kind:'complete'}]};
  c.observe(state); assert.equal(c.pose(),null, 'historical completion is not replayed');
  const next={...state,cursor:2,notices:[...state.notices,{id:2,kind:'complete'}]};
  c.observe(next); assert.equal(c.pose(),'complete');
  now=19999; c.observe(next); assert.equal(c.pose(),'complete');
  now=20000; assert.equal(c.pose(),null, 'duplicate polling must not extend the celebration');
  c.observe({...next,cursor:3,notices:[{id:3,kind:'complete'}]}); assert.equal(c.pose(),'complete');
  c.observe({...next,generation:'g2'}); assert.equal(c.pose(),null);
});

test('new work and dismissal clear outcomes; errors and cancellation replace celebration', () => {
  const c=new Outcome(()=>0);
  const state={generation:'g',cursor:0,runningCount:0,notices:[]}; c.observe(state);
  c.observe({...state,cursor:1,notices:[{id:1,kind:'error'}]}); assert.equal(c.pose(),'error');
  c.observe({...state,cursor:2,notices:[{id:2,kind:'complete'}]}); assert.equal(c.pose(),'complete');
  c.dismiss(); assert.equal(c.pose(),null);
  c.observe({...state,cursor:3,notices:[{id:3,kind:'complete'}]});
  c.observe({...state,cursor:3,runningCount:1}); assert.equal(c.pose(),null);
  c.observe({...state,cursor:4,runningCount:1,notices:[{id:4,kind:'complete'}]}); assert.equal(c.pose(),'complete');
  c.observe({...state,cursor:5,runningCount:1,notices:[{id:5,kind:'error'}]}); assert.equal(c.pose(),'error');
  c.observe({...state,cursor:6,runningCount:1,notices:[{id:6,kind:'cancel'}]}); assert.equal(c.pose(),'cancel');
});

test('failure and cancellation override work but never confirmation or health', () => {
  for (const outcomePose of ['error','cancel']) {
    assert.equal(pose({outcomePose,runningCount:1}),outcomePose);
    assert.equal(pose({outcomePose,waitingCount:1}), 'waiting');
    assert.equal(pose({outcomePose,dueCount:1}), 'health');
  }
  assert.equal(pose({outcomePose:'unknown'}), 'idle');
});

test('all outcome kinds suppress history and expire without replay; latest outcome wins', () => {
  for (const kind of ['error','cancel']) {
    let now=0; const c=new Outcome(()=>now);
    const state={generation:'g',cursor:1,runningCount:0,notices:[{id:1,kind}]};
    c.observe(state); assert.equal(c.pose(),null);
    const next={...state,cursor:3,notices:[{id:2,kind:'complete'},{id:3,kind}]};
    c.observe(next); assert.equal(c.pose(),kind);
    now=19999; c.observe(next); assert.equal(c.pose(),kind);
    now=20000; c.observe(next); assert.equal(c.pose(),null);
    c.observe({...next,cursor:4,notices:[{id:4,kind:'wait'}]}); assert.equal(c.pose(),null);
  }
});

test('work starting after an ending clears it even when the running count stays unchanged',()=>{
  for(const kind of ['complete','error','cancel']){
    const c=new Outcome(()=>0),base={generation:'g',cursor:0,newWorkCursor:0,runningCount:1,notices:[]};c.observe(base);
    const ended={...base,cursor:1,notices:[{id:1,kind}]};c.observe(ended);assert.equal(c.pose(),kind);
    c.observe({...ended,newWorkCursor:1});assert.equal(c.pose(),null);
    const coalesced=new Outcome(()=>0);coalesced.observe(base);coalesced.observe({...ended,newWorkCursor:1});assert.equal(coalesced.pose(),null);
    c.observe({...ended,cursor:2,newWorkCursor:1,notices:[{id:2,kind}]});assert.equal(c.pose(),kind,'a later ending is still shown');
  }
});
