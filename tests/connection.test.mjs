import test from 'node:test';
import assert from 'node:assert/strict';
const {toolAvailability}=await import('../src/connection.cjs').catch(()=>({}));
test('old Host missing capability fields requests reload instead of claiming non-Windows',()=>{
  assert.equal(typeof toolAvailability,'function');
  for(const kind of ['ports','folders']){
    const value=toolAvailability({runningCount:0},kind,'current');
    assert.equal(value.ready,false);assert.match(value.message,/后台.*重新/);assert.doesNotMatch(value.message,/仅支持 Windows/);
  }
});
test('tool availability distinguishes connecting, unsupported platform and missing project',()=>{
  for(const kind of ['ports','folders']){
    assert.match(toolAvailability(null,kind,'current').message,/连接/);
    assert.match(toolAvailability({[kind+'Supported']:false},kind,'current').message,/Windows/);
    assert.match(toolAvailability({[kind+'Supported']:true},kind,null).message,/会话/);
    assert.deepEqual(toolAvailability({[kind+'Supported']:true},kind,'current'),{ready:true,message:''});
  }
});
