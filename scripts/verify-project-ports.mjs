// Only creates and stops its own temporary listeners, never user services.
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {createPortManager} from '../src/ports.mjs';
await mkdir('tmp/project-verification',{recursive:true});
const folder=await mkdtemp(join(process.cwd(),'tmp/project-verification/case-'));
const project=join(folder,'project with spaces'),other=project+'-other';
await mkdir(project);await mkdir(other);
const source="const net=require('node:net');const a=net.createServer(),b=net.createServer();a.listen(0,'127.0.0.1',()=>b.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({pid:process.pid,ports:[a.address().port,b.address().port]}))));";
await writeFile(join(project,'server.cjs'),source);await writeFile(join(other,'server.cjs'),source);
const children=[],manager=createPortManager();
async function start(args,executable=process.execPath){
  const child=spawn(executable,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(child);
  return await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('listener timeout')),10000);child.stdout.setEncoding('utf8');child.stdout.on('data',part=>{output+=part;if(output.includes('\n')){clearTimeout(timer);resolve(JSON.parse(output.split('\n')[0]));}});child.on('error',reject);});
}
try {
  const own=await start([join(project,'server.cjs')]),neighbor=await start([join(other,'server.cjs')]);
  const textOnly=await start(['-e',source,join(project,'server.cjs')]);
  await copyFile(process.execPath,join(project,'node.exe'));
  const sharedRuntime=await start([join(other,'server.cjs')],join(project,'node.exe'));
  const scanned=await manager.scanProject(project);
  assert.deepEqual(scanned.owners.map(o=>o.pid),[own.pid],JSON.stringify(scanned));
  assert.deepEqual([...scanned.owners[0].ports].sort(),[...own.ports].sort());assert.ok(scanned.owners[0].canTerminate);
  console.log('Scoped scan identified own two-port listener; excluded adjacent project and eval text:',own.pid,neighbor.pid,textOnly.pid);
  const result=await manager.terminateProject(project,scanned.owners[0].token);assert.equal(result.owners.length,0);
  assert.ok((await manager.inspect(neighbor.ports[0])).owners.some(o=>o.pid===neighbor.pid));
  assert.ok((await manager.inspect(textOnly.ports[0])).owners.some(o=>o.pid===textOnly.pid));
  assert.ok((await manager.inspect(sharedRuntime.ports[0])).owners.some(o=>o.pid===sharedRuntime.pid));
  await assert.rejects(manager.terminateProject(project,scanned.owners[0].token),/失效/);
  console.log(result.message);console.log('Other listeners survived, and capability replay rejected.');
} finally {manager.dispose();for(const child of children)if(child.exitCode===null)child.kill();}
