// Uses only this script's own temporary listeners. Never accepts a user PID or port.
import net from 'node:net';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {createPortManager} from '../src/ports.mjs';
if(process.platform!=='win32')throw Error('Windows verification only');
const manager=createPortManager(),selfServer=net.createServer();
const child=spawn(process.execPath,['-e',`const net=require('node:net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:s.address().port,pid:process.pid})));`],{windowsHide:true,stdio:['ignore','pipe','pipe']});
try {
  const target=await new Promise((resolve,reject)=>{let buffer='';const timer=setTimeout(()=>reject(Error('temporary listener did not start')),10000);
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;if(buffer.includes('\n')){clearTimeout(timer);resolve(JSON.parse(buffer.split('\n')[0]));}});
    child.on('error',e=>{clearTimeout(timer);reject(e);});});
  const inspected=await manager.inspect(target.port),owner=inspected.owners.find(o=>o.pid===target.pid);
  assert.ok(owner?.canTerminate,JSON.stringify(inspected));
  console.log('Own temporary listener identified:',target.port,target.pid);
  const result=await manager.terminate(owner.token);assert.equal(result.owners.length,0);console.log(result.message);
  await assert.rejects(manager.terminate(owner.token),/失效/);
  await new Promise(resolve=>selfServer.listen(0,'127.0.0.1',resolve));
  const self=await manager.inspect(selfServer.address().port),protectedOwner=self.owners.find(o=>o.pid===process.pid);
  assert.equal(protectedOwner?.canTerminate,false);assert.equal(protectedOwner?.token,undefined);
  console.log('Host protection and one-use capability verified.');
} finally {manager.dispose();selfServer.close();if(child.exitCode===null)child.kill();}
