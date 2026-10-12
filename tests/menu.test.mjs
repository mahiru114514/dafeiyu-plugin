import test from 'node:test';
import assert from 'node:assert/strict';
const {menuPosition}=await import('../src/menu.cjs').catch(()=>({}));
test('context menu remains inside small and normal Harness viewports',()=>{
  for(const viewport of [{width:390,height:740},{width:657,height:903}]) {
    const p=menuPosition({x:viewport.width-1,y:viewport.height-1},{width:208,height:270},viewport);
    assert.ok(p.x>=8&&p.y>=8); assert.ok(p.x+208<=viewport.width-8); assert.ok(p.y+270<=viewport.height-8);
  }
  assert.deepEqual(menuPosition({x:-50,y:-10},{width:208,height:190},{width:657,height:903}),{x:8,y:8});
});
