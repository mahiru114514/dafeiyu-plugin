import test from 'node:test';
import assert from 'node:assert/strict';
const {ProjectSelection,currentSessionId}=await import('../src/project.cjs').then(m=>m.default).catch(()=>({}));
test('main view selection refuses absent or ambiguous sessions',()=>{
  assert.equal(typeof currentSessionId,'function');
  const store=rows=>({getSnapshot:()=>({byId:rows})});
  assert.equal(currentSessionId(store({a:{id:'a',retainedBy:{background:1}},b:{id:'b',retainedBy:{mainView:1}}})),'b');
  assert.equal(currentSessionId(store({})),null);
  assert.equal(currentSessionId(store({a:{id:'a',retainedBy:{mainView:1}},b:{id:'b',retainedBy:{mainView:1}}})),null);
});
test('A to B to A invalidates outstanding scans even when the final session ID matches',()=>{
  assert.equal(typeof ProjectSelection,'function');const choice=new ProjectSelection('a'),old=choice.snapshot();
  assert.ok(choice.matches(old));assert.equal(choice.select('a'),false);assert.ok(choice.matches(old));
  choice.select('b');choice.select('a');assert.equal(choice.matches(old),false);assert.ok(choice.matches(choice.snapshot()));
});
