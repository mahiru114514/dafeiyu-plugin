import test from 'node:test';
import assert from 'node:assert/strict';
const {createPortManager}=await import('../src/ports.mjs').catch(()=>({}));
function fixture() {
  let now=1000, owners=[{pid:1001,name:'node.exe',path:'E:\\project\\node.exe',startedAt:'638950000000000001',addresses:['127.0.0.1'],canTerminate:true}], killed=[];
  const calls=[];
  const run=async request=>{calls.push(request); if(request.mode==='inspect')return{owners:structuredClone(owners)};
    const target=owners.find(o=>o.pid===request.pid&&o.startedAt===request.startedAt); if(!target)throw Error('进程已改变');
    killed.push(request.pid); owners=owners.filter(o=>o!==target); return{terminated:true};};
  const manager=createPortManager({platform:'win32',hostPid:500,run,now:()=>now});
  return{manager,calls,killed,setOwners(v){owners=v;},advance(ms){now+=ms;}};
}
test('inspect validates ports before invoking Windows and never issues capabilities for protected targets',async()=>{
  const f=fixture();
  for(const port of [0,65536,1.5,'5173;Stop-Process',NaN])await assert.rejects(f.manager.inspect(port),/端口/);
  assert.equal(f.calls.length,0);
  f.setOwners([{pid:500,name:'node.exe',startedAt:'123',canTerminate:true},{pid:4,name:'System',canTerminate:false,blockedReason:'系统进程'}]);
  const result=await f.manager.inspect(5173);
  assert.equal(result.owners.every(o=>!o.token&&o.canTerminate===false),true);
});
test('a chosen capability stops one verified process and rechecks the released port',async()=>{
  const f=fixture(), result=await f.manager.inspect(5173);
  assert.equal(result.port,5173); assert.equal(result.owners[0].name,'node.exe');
  const stopped=await f.manager.terminate(result.owners[0].token);
  assert.deepEqual(f.killed,[1001]); assert.equal(stopped.owners.length,0); assert.match(stopped.message,/已释放/);
  await assert.rejects(f.manager.terminate(result.owners[0].token),/失效|过期/);
});
test('expiration, PID reuse, protection changes and already-free ports cannot kill a process',async()=>{
  const f=fixture(), first=await f.manager.inspect(5173); f.advance(90000);
  await assert.rejects(f.manager.terminate(first.owners[0].token),/过期/);
  const second=await f.manager.inspect(5173); f.setOwners([{...second.owners[0],startedAt:'different'}]);
  await assert.rejects(f.manager.terminate(second.owners[0].token),/改变|重新/);
  const third=await f.manager.inspect(5173); f.setOwners([{...third.owners[0],canTerminate:false,blockedReason:'保护'}]);
  await assert.rejects(f.manager.terminate(third.owners[0].token),/保护|重新/);
  f.setOwners([{pid:1001,name:'node.exe',startedAt:'valid',canTerminate:true}]);
  const fourth=await f.manager.inspect(5173); f.setOwners([]);
  const released=await f.manager.terminate(fourth.owners[0].token); assert.match(released.message,/已释放/);
  assert.equal(f.killed.length,0);
});
test('unknown tokens, unsupported OS and disposal never invoke termination',async()=>{
  const f=fixture(); await assert.rejects(f.manager.terminate('arbitrary-pid'),/失效|过期/);
  const token=(await f.manager.inspect(5173)).owners[0].token; f.manager.dispose();
  await assert.rejects(f.manager.terminate(token),/停用/);
  await assert.rejects(f.manager.inspect(5173),/停用/); assert.equal(f.killed.length,0);
  const other=createPortManager({platform:'linux',run:()=>{throw Error('must not run');}});
  assert.equal(other.supported,false); await assert.rejects(other.inspect(5173),/Windows/);
});
test('concurrent reuse of the same capability can terminate at most once',async()=>{
  const f=fixture(),token=(await f.manager.inspect(3000)).owners[0].token;
  const results=await Promise.allSettled([f.manager.terminate(token),f.manager.terminate(token)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1); assert.deepEqual(f.killed,[1001]);
});

function projectFixture() {
  let owners=[{pid:1001,name:'node.exe',path:'C:\\node.exe',startedAt:'638950000000000001',ports:[3000,5173],addresses:['127.0.0.1'],evidence:'启动脚本位于项目内',canTerminate:true}];
  const killed=[],calls=[];
  const manager=createPortManager({platform:'win32',hostPid:500,run:async request=>{
    calls.push(request);if(request.mode==='scan-project')return{owners:structuredClone(owners)};
    killed.push(request.pid);owners=[];return{terminated:true};
  }});
  return{manager,calls,killed,setOwners(value){owners=value;}};
}
test('project scan groups ports and capabilities cannot be used in another project or manual mode',async()=>{
  const f=projectFixture(),root='E:\\project';
  const result=await f.manager.scanProject(root);assert.equal(result.projectPath,root);assert.deepEqual(result.owners[0].ports,[3000,5173]);
  await assert.rejects(f.manager.terminate(result.owners[0].token),/项目/);
  const second=await f.manager.scanProject(root);
  await assert.rejects(f.manager.terminateProject('E:\\other',second.owners[0].token),/项目/);assert.deepEqual(f.killed,[]);
  const third=await f.manager.scanProject(root),ended=await f.manager.terminateProject(root,third.owners[0].token);
  assert.deepEqual(f.killed,[1001]);assert.equal(ended.owners.length,0);assert.match(ended.message,/已释放/);
  assert.equal(f.calls.find(c=>c.mode==='terminate-project').projectPath,root);
  await assert.rejects(f.manager.terminateProject(root,third.owners[0].token),/失效/);
});
test('project release refuses changed instance or lost project attribution and rejects disk roots',async()=>{
  const f=projectFixture();for(const root of ['E:\\','relative','',null])await assert.rejects(f.manager.scanProject(root),/项目/);
  const first=await f.manager.scanProject('E:\\project');f.setOwners([{...first.owners[0],startedAt:'different'}]);
  await assert.rejects(f.manager.terminateProject('E:\\project',first.owners[0].token),/改变/);
  const second=await f.manager.scanProject('E:\\project');f.setOwners([]);
  await assert.rejects(f.manager.terminateProject('E:\\project',second.owners[0].token),/项目|退出/);assert.deepEqual(f.killed,[]);
});
