import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHost } from '../src/index.mjs';
import { createPortManager } from '../src/ports.mjs';
const listeners = new Map(), routes = new Map(), agents = new Map();
let offset = 0, startupOffset = 0, answer;
let legacyHost=false;
function previewState(value){if(!legacyHost)return value;const old={...value};for(const key of ['portsSupported','foldersSupported','pluginVersion','apiVersion'])delete old[key];return old;}
const clock = () => [performance.now() + offset, Date.now() + offset];
const ctx = { agents: { list: () => [...agents.values()], roots: () => [...agents.values()] },
  sessions:{get:id=>id==='demo-project'?{header:{cwd:'E:\\demo-project'}}:id==='other-project'?{header:{cwd:'E:\\other-project'}}:undefined},
  workspaceRegistry:{list:()=>[{sessionIds:['demo-project'],path:'E:\\demo-project'},{sessionIds:['other-project'],path:'E:\\other-project'}]},
  on(name, fn) { listeners.set(name, fn); return () => listeners.delete(name); }, effect() {},
  connection: { fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } } } };
await mkdir('tmp/preview', { recursive: true });
let demoPortOccupied=true;
const simulatedPorts=createPortManager({platform:'win32',run:async request=>{
  if(request.mode==='scan-project')return{owners:request.projectPath==='E:\\demo-project'&&demoPortOccupied?[{pid:90001,name:'node.exe',path:'C:\\Program Files\\nodejs\\node.exe',startedAt:'638950000000000000',ports:[3000,5173],addresses:['127.0.0.1'],evidence:'启动脚本位于当前项目内',canTerminate:true}]:[]};
  if(request.mode==='inspect')return{owners:request.port===5173&&demoPortOccupied?[{pid:90001,name:'node.exe',path:'E:\\demo-project\\node.exe',startedAt:'638950000000000000',addresses:['127.0.0.1'],canTerminate:true}]:request.port===4320?[{pid:process.pid,name:'Harness Host',path:process.execPath,startedAt:'638950000000000001',addresses:['127.0.0.1'],canTerminate:false,blockedReason:'Harness 自身受到保护，不能结束。'}]:[]};
  if(request.pid!==90001||![3000,5173].includes(request.port))throw Error('模拟目标无效');demoPortOccupied=false;return{terminated:true};
}});
const portManager={supported:true,async inspect(port){return{...await simulatedPorts.inspect(port),simulated:true};},async terminate(token){return{...await simulatedPorts.terminate(token),simulated:true};},async scanProject(root){return{...await simulatedPorts.scanProject(root),simulated:true};},async terminateProject(root,token){return{...await simulatedPorts.terminateProject(root,token),simulated:true};},dispose(){simulatedPorts.dispose();}};
const folderOpener={supported:true,open:async folderPath=>({folderPath,simulated:true}),dispose(){}};
const host = await createHost(ctx, { clock,portManager,folderOpener, uptime:()=>process.uptime()+startupOffset, stateFile: join(process.cwd(), 'tmp/preview', `state-${Date.now()}.json`) });
const files = new Map([
  ['/', ['preview/index.html', 'text/html']], ['/lib/client.js', ['lib/client.js', 'application/javascript']],
  ['/vendor/react.js', ['node_modules/react/umd/react.development.js', 'application/javascript']],
  ['/vendor/react-dom.js', ['node_modules/react-dom/umd/react-dom.development.js', 'application/javascript']],
]);
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'POST' && req.headers['sec-fetch-site'] === 'cross-site') { res.writeHead(403).end(); return; }
    if (files.has(url.pathname) && req.method === 'GET') {
      const [file, type] = files.get(url.pathname); res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); res.end(await readFile(file)); return;
    }
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 8192) { res.writeHead(413).end(); return; } }
    if (url.pathname === '/preview/event' && req.method === 'POST') {
      const { type, id = 'demo-a' } = JSON.parse(body);
      const a = agents.get(id) ?? { id, status: 'idle', session: { id } }; agents.set(id, a);
      if (type === 'start') { a.status = 'running'; listeners.get('agent/status')({ agent: a, status: 'running' }); }
      else if(type==='replace'){
        listeners.get('session/event')(a.session,{type:'turn/end',data:{turn:Date.now(),reason:{kind:'completed'}}});
        a.status='idle';listeners.get('agent/status')({agent:a,status:'idle'});
        const b=agents.get('demo-b')??{id:'demo-b',status:'idle',session:{id:'demo-b'}};agents.set(b.id,b);
        b.status='running';listeners.get('agent/status')({agent:b,status:'running'});
      }
      else if (['complete', 'error', 'cancel'].includes(type)) {
        listeners.get('session/event')(a.session, { type: 'turn/end', data: { turn: Date.now(), reason: { kind: type === 'complete' ? 'completed' : type === 'cancel' ? 'aborted' : 'error', ...(type === 'cancel' ? {reason:{kind:'user'}} : {}) } } });
        a.status = 'idle'; listeners.get('agent/status')({ agent: a, status: 'idle' });
      } else if (type === 'wait') {
        if (answer) answer({ answers: [] });
        void listeners.get('user-questions/request')({ agent: a, wait: { callId: 'preview-' + Date.now() } }, () => new Promise(r => { answer = r; }));
      } else if (type === 'answer') { answer?.({ answers: [] }); answer = null; }
      else if (type === 'advance') {
        const [mono, wall] = clock();
        for (let i = 1; i <= 7200; i++) host.state.tick(mono + i * 1000, wall + i * 1000);
        offset += 7200000;
      } else if(type === 'greet') startupOffset = -process.uptime();
      else if(type === 'after-welcome') startupOffset = Math.max(0,301-process.uptime());
      else if(type==='legacy-host')legacyHost=true;
      else if(type==='current-host')legacyHost=false;
      else throw Error('Unknown preview event');
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(host.snapshot())); return;
    }
    const route = routes.get(url.pathname);
    if (!route || !route.methods.includes(req.method)) { res.writeHead(404).end(); return; }
    if(legacyHost&&url.pathname==='/api/harness-pet/action'&&['open-workspace','scan-project','release-project'].includes(JSON.parse(body).type)){res.writeHead(400,{'content-type':'application/json'}).end(JSON.stringify({error:'不支持此操作'}));return;}
    const response = await route.fetch(new Request(`http://127.0.0.1${url.pathname}`, { method: req.method, body: req.method === 'POST' ? body : undefined }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if(url.pathname==='/api/harness-pet/state')res.end(JSON.stringify(previewState(await response.json())));
    else res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
});
server.listen(Number(process.env.PET_PREVIEW_PORT || 4318), '127.0.0.1', () => console.log('Preview http://127.0.0.1:' + server.address().port));
process.on('SIGINT', async () => { await host.dispose(); server.close(() => process.exit()); });
