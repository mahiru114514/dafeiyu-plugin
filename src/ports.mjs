import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,win32} from 'node:path';
import {randomUUID} from 'node:crypto';

let script;
async function runWindows(request, signal) {
  script ??= readFile(new URL('./windows-ports.ps1',import.meta.url),'utf8');
  const encoded=Buffer.from(await script,'utf16le').toString('base64');
  const executable=join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',encoded],{
      windowsHide:true,stdio:['ignore','pipe','pipe'],signal,
      env:{...process.env,DSH_PET_PORT_REQUEST:JSON.stringify(request)}});
    let output='', settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>{child.kill();finish(Error('端口检查超时，请重试。'));},12000);
    child.stdout.setEncoding('utf8'); child.stdout.on('data',chunk=>{
      output+=chunk;if(output.length>262144){child.kill();finish(Error('进程信息过大，请重试。'));}});
    child.stderr.resume();
    child.on('error',()=>finish(Error(signal.aborted?'插件已停用。':'无法启动 Windows 端口检查。')));
    child.on('close',code=>{
      try{const value=JSON.parse(output.replace(/^\uFEFF/,''));
        if(code!==0||value.error)finish(Error(value.error||'端口检查失败。'));else finish(null,value);}
      catch{finish(Error('Windows 未返回有效的端口信息。'));}
    });
  });
}

export function createPortManager({platform=process.platform,hostPid=process.pid,run=runWindows,now=Date.now}={}) {
  const supported=platform==='win32', capabilities=new Map(), controllers=new Set(); let closed=false;
  const assertOpen=()=>{if(closed)throw Error('插件已停用。');if(!supported)throw Error('端口清理目前仅支持 Windows。');};
  const validatePort=port=>{if(!Number.isInteger(port)||port<1||port>65535)throw Error('端口必须是 1–65535 的整数。');};
  async function execute(request) {
    assertOpen(); const controller=new AbortController();controllers.add(controller);
    try{return await run({...request,hostPid},controller.signal);}finally{controllers.delete(controller);}
  }
  function projectRoot(root) {
    if(typeof root!=='string'||!win32.isAbsolute(root)||root.includes('\0'))throw Error('无法确认当前项目目录。');
    const normalized=win32.normalize(root).replace(/[\\/]+$/,'');
    if(normalized.toLowerCase()===win32.parse(root).root.replace(/[\\/]+$/,'').toLowerCase())throw Error('不能将磁盘根目录作为项目扫描范围。');
    return normalized;
  }
  function present(port, owners, projectPath) {
    assertOpen();for(const [token,cap] of capabilities)if(cap.expiresAt<=now())capabilities.delete(token);
    return {port,owners:owners.map(owner=>{
      const canTerminate=owner.canTerminate===true&&Number.isInteger(owner.pid)&&owner.pid>4&&owner.pid!==hostPid&&typeof owner.startedAt==='string'&&owner.startedAt.length>0;
      const item={pid:owner.pid,name:owner.name,path:owner.path||'',addresses:owner.addresses||[],startedAt:owner.startedAt,
        ports:owner.ports||[port],evidence:owner.evidence||'',
        canTerminate,blockedReason:canTerminate?'':owner.blockedReason||'此进程受到保护，不能结束。'};
      if(canTerminate){const token=randomUUID(),expiresAt=now()+90000;
        capabilities.set(token,{port:port??owner.ports?.[0],projectPath,pid:owner.pid,startedAt:owner.startedAt,expiresAt});
        item.token=token;item.expiresAt=expiresAt;}
      while(capabilities.size>256)capabilities.delete(capabilities.keys().next().value);
      return item;
    }),...(projectPath?{projectPath}:{})};
  }
  async function inspect(port) {assertOpen();validatePort(port);const value=await execute({mode:'inspect',port});return present(port,value.owners);}
  async function terminate(token) {
    assertOpen();const cap=capabilities.get(token);capabilities.delete(token);
    if(!cap)throw Error('进程列表已失效，请重新检查端口。');
    if(cap.expiresAt<=now())throw Error('进程列表已过期，请重新检查端口。');
    if(cap.projectPath)throw Error('此凭据仅可用于对应项目。');
    const fresh=await execute({mode:'inspect',port:cap.port});
    if(!fresh.owners.length)return {...present(cap.port,[]),message:`端口 ${cap.port} 已释放，无需结束进程。`};
    const owner=fresh.owners.find(o=>o.pid===cap.pid);
    if(!owner||owner.startedAt!==cap.startedAt)throw Error('占用进程已改变，请重新检查端口。');
    if(owner.canTerminate!==true||owner.pid===hostPid||owner.pid<=4)throw Error('此进程受到保护，请重新检查端口。');
    await execute({mode:'terminate',port:cap.port,pid:cap.pid,startedAt:cap.startedAt});
    const result=await inspect(cap.port);
    return {...result,message:result.owners.length?`已结束 PID ${cap.pid}；端口仍被占用，请检查新的进程。`:`已结束 PID ${cap.pid}，端口 ${cap.port} 已释放。`};
  }
  async function scanProject(root) {
    assertOpen();const projectPath=projectRoot(root),value=await execute({mode:'scan-project',projectPath});
    return present(undefined,value.owners,projectPath);
  }
  async function terminateProject(root,token) {
    assertOpen();const projectPath=projectRoot(root),cap=capabilities.get(token);capabilities.delete(token);
    if(!cap)throw Error('进程列表已失效，请重新扫描。');
    if(cap.expiresAt<=now())throw Error('进程列表已过期，请重新扫描。');
    if(!cap.projectPath||cap.projectPath.toLowerCase()!==projectPath.toLowerCase())throw Error('项目已改变，请重新扫描。');
    const fresh=await execute({mode:'scan-project',projectPath}),owner=fresh.owners.find(o=>o.pid===cap.pid);
    if(!owner)throw Error('进程已退出或不再属于此项目，请重新扫描。');
    if(owner.startedAt!==cap.startedAt)throw Error('占用进程已改变，请重新扫描。');
    if(!owner.canTerminate||owner.pid===hostPid||owner.pid<=4)throw Error('此进程受到保护，请重新扫描。');
    const port=owner.ports?.find(p=>Number.isInteger(p)&&p>0&&p<=65535);validatePort(port);
    await execute({mode:'terminate-project',projectPath,port,pid:cap.pid,startedAt:cap.startedAt});
    const result=await scanProject(projectPath);
    return {...result,message:`已结束 PID ${cap.pid}；该进程的端口已释放。${result.owners.length?'仍有其他项目服务，可继续检查。':''}`};
  }
  function dispose(){closed=true;capabilities.clear();for(const controller of controllers)controller.abort();controllers.clear();}
  return {supported,inspect,terminate,scanProject,terminateProject,dispose};
}
