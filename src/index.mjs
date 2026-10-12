import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { PetState } from './core.mjs';
import { createPortManager } from './ports.mjs';
import {createFolderOpener} from './folders.mjs';
import {approvalProjection} from './pending.mjs';
export const name = 'harness-pet';
export const inject = ['agents', 'sessions', 'connection', 'workspaceRegistry'];
function home() {
  const value = process.env.DSH_HOME?.trim();
  if (!value) return join(homedir(), '.dsh');
  if (value === '~') return homedir();
  return resolve(value.startsWith('~/') || value.startsWith('~\\') ? join(homedir(), value.slice(2)) : value);
}
function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
}
export async function createHost(ctx, options = {}) {
  const clock = options.clock ?? (() => [performance.now(), Date.now()]);
  const pluginVersion=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
  const stateFile = options.stateFile ?? join(home(), 'plugin-data', 'harness-pet', 'state.json');
  let saved, storageError = '', readBlocked = false;
  try { saved = JSON.parse(await readFile(stateFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') { readBlocked = true; storageError = '统计文件无法读取，已保留原文件；本次数据暂不保存。'; } }
  let state;
  const [mono, wall] = clock();
  try { state = new PetState({ mono, wall, saved }); }
  catch { readBlocked = true; storageError = '统计文件损坏或版本不兼容，已保留原文件；本次数据暂不保存。'; state = new PetState({ mono, wall }); }
  const generation = randomUUID(), endings = new Map(), cleanups = [];
  const ports = options.portManager ?? createPortManager();
  const folders=options.folderOpener??createFolderOpener();
  let disposed = false, closing, writes = Promise.resolve(), ticks = 0, interval;
  const foregroundQuestions=new Set(),settledQuestions=new Set();
  let projectedWaits=new Set(),pendingError='';
  const projections=ctx.get?.('sessionProjections');
  function snapshot() { return { ...state.snapshot(), generation,pluginVersion,apiVersion:1, storageError,pendingError, portsSupported:ports.supported, foldersSupported:folders.supported, startupElapsedMs: (options.uptime ?? (() => process.uptime()))() * 1000 }; }
  function persist() {
    if (readBlocked) return writes;
    const data = JSON.stringify(state.serialize());
    writes = writes.then(async () => {
      const temp = stateFile + '.' + generation + '.tmp';
      try {
        await mkdir(dirname(stateFile), { recursive: true });
        await writeFile(temp, data, 'utf8'); await rename(temp, stateFile); storageError = '';
      } catch { storageError = '统计保存失败，本次数据保留在内存中。'; }
    });
    return writes;
  }
  function tick() {
    if (disposed) return;
    state.tick(...clock());
    syncPending();
    if (++ticks % 30 === 0) void persist();
  }
  function rootOf(id) {
    let current = id; const visited = new Set();
    while (!visited.has(current)) {
      visited.add(current);
      const parent = ctx.agents.list().find(a => ctx.agents.isOwnedBy?.(current, a));
      if (!parent) return current; current = parent.id;
    }
    return id;
  }
  function isRoot(id) { return ctx.agents.roots().some(a => a.id === id); }
  function syncPending(){
    if(!projections)return;
    let live;
    try{
      // A registry read materializes other plugins too. Keep the last known waits
      // if any projection fails; a foreign fold must not interrupt our timer.
      live=ctx.agents.list().map(agent=>({agent,approvals:projections.stateOf(agent.session,approvalProjection.key),questions:projections.stateOf(agent.session,'userQuestions')}));
      pendingError='';
    }catch{pendingError='待确认状态暂时无法同步，已保留已有提醒；稍后自动重试。';return;}
    const next=new Set(),activeQuestions=new Set();
    for(const {agent,approvals,questions} of live){
      for(const id of approvals?.pending??[]){const key='approval:'+id;next.add(key);state.wait(key,rootOf(agent.id),agent.id);}
      for(const q of questions?.questions.active??[]){
        const key=`question:${agent.id}:${q.callId}`;activeQuestions.add(key);
        if(!settledQuestions.has(key)){next.add(key);state.wait(key,rootOf(agent.id),agent.id);}
      }
    }
    for(const key of projectedWaits)if(!next.has(key)&&!foregroundQuestions.has(key))state.resolveWait(key);
    for(const key of settledQuestions)if(!activeQuestions.has(key))settledQuestions.delete(key);
    projectedWaits=next;
  }
  function listen(event, fn, flags) { cleanups.push(ctx.on(event, fn, flags)); }
  const dispose = () => {
    if (closing) return closing;
    tick(); disposed = true; clearInterval(interval);
    ports.dispose();
    folders.dispose();
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    closing = persist(); return closing;
  };
  // Register cleanup before other effects so initialization failure is also reversible.
  ctx.effect(() => dispose);
  if(projections)cleanups.push(projections.register(approvalProjection));
  listen('agent/created', ({ agent }) => { tick(); state.setRunning(agent.id, agent.status === 'running'); });
  listen('agent/disposed', ({ agent }) => { tick(); state.setRunning(agent.id, false); state.clearWaits(agent.id); endings.delete(agent.id); void persist(); });
  listen('agent/status', ({ agent, status }) => {
    tick(); const wasRunning = state.running.has(agent.id); state.setRunning(agent.id, status === 'running');
    if (status === 'idle' && wasRunning && isRoot(agent.id)) {
      const ending = endings.get(agent.id); endings.delete(agent.id);
      const pending = [...state.waiting.values()].some(w => w.sessionId === agent.id);
      if (ending && !pending) {
        const kind = ending.reason?.kind;
        if (kind === 'completed') state.notice('complete', agent.id, '本轮运行结束啦，回来看看成果吧。', `${agent.id}:end:${ending.turn}`);
        else if (kind === 'error' || kind === 'max-tokens' || kind === 'blocked') state.notice('error', agent.id, '运行遇到问题，需要你看一下。', `${agent.id}:end:${ending.turn}`);
        else if (kind === 'aborted' && ending.reason.reason?.kind === 'user') state.notice('cancel', agent.id, '本轮运行已停止。', `${agent.id}:end:${ending.turn}`);
      }
    }
    void persist();
  });
  listen('session/event', (session, event) => {
    const id = session.id, data = event.data;
    if (event.type === 'turn/end') endings.set(id, data);
    else if (event.type === 'approval/asked') state.wait('approval:' + data.id, rootOf(id), id);
    else if (event.type === 'approval/decided') state.resolveWait('approval:' + data.id);
    else if (event.type === 'user/message' && data.source?.kind === 'user-question-reply') {const key=`question:${id}:${data.source.callId}`;if(projections)settledQuestions.add(key);state.resolveWait(key);}
  });
  // Observe before the UI answerer without ever claiming or changing its answer.
  listen('user-questions/request', async (request, next) => {
    const id = request.agent?.id;
    if (!id || disposed) return next();
    const key = `question:${id}:${request.wait?.callId ?? randomUUID()}`;
    foregroundQuestions.add(key);
    state.wait(key, rootOf(id), id);
    try { const answer = await next(); if(projections)settledQuestions.add(key);state.resolveWait(key); return answer; }
    catch (error) {
      // Timed questions remain answerable in the official UI after foreground timeout.
      if (error?.code !== 'ASK_TIMED_OUT'&&!(error?.code==='NO_PROVIDER'&&request.wait?.timed===true)) {if(projections)settledQuestions.add(key);state.resolveWait(key);}
      throw error;
    }finally{foregroundQuestions.delete(key);}
  }, { prepend: true });
  for (const agent of ctx.agents.list()) state.setRunning(agent.id, agent.status === 'running');
  syncPending();
  cleanups.push(ctx.connection.fetch.register({ path: '/api/harness-pet/state', methods: ['GET'], requestBody: 'buffered',
    fetch: async () => { tick(); return json(snapshot()); } }));
  cleanups.push(ctx.connection.fetch.register({ path: '/api/harness-pet/action', methods: ['POST'], requestBody: 'buffered',
    fetch: async request => {
      try {
        if(disposed)throw Error('插件已停用。');
        const text = await request.text(); if (text.length > 8192) return json({ error: '请求过大' }, 413);
        if(disposed)throw Error('插件已停用。');
        const action = JSON.parse(text); tick();
        if (!action || typeof action !== 'object' || Array.isArray(action)) throw Error('操作格式不正确');
        if(action.type==='open-workspace') {
          if(typeof action.sessionId!=='string'||action.sessionId.length>256)throw Error('请先打开当前项目的会话。');
          const session=ctx.sessions?.get(action.sessionId);
          if(!session)throw Error('当前会话不可用，请重新打开项目会话。');
          const workspace=ctx.workspaceRegistry?.list().find(w=>w.sessionIds.includes(action.sessionId));
          const folderPath=workspace?.path??session.header?.cwd;
          const folderResult=await folders.open(folderPath);
          return json({...snapshot(),folderResult});
        }
        if(action.type==='scan-project'||action.type==='release-project') {
          if(typeof action.sessionId!=='string'||action.sessionId.length>256)throw Error('请先打开当前项目的会话。');
          const projectPath=ctx.sessions?.get(action.sessionId)?.header?.cwd;
          if(typeof projectPath!=='string'||!projectPath.trim())throw Error('无法确认当前会话的项目目录，请打开项目会话后重试。');
          const portInspection=action.type==='scan-project'?await ports.scanProject(projectPath):await ports.terminateProject(projectPath,action.token);
          return json({...snapshot(),portInspection:{...portInspection,sessionId:action.sessionId}});
        }
        if (action.type === 'configure') state.configure(action.patch);
        else if (action.type === 'ack') state.ack(action.kind);
        else if (action.type === 'snooze') state.snooze(action.kind);
        else throw Error('不支持此操作');
        await persist(); return json(snapshot());
      } catch (error) { return json({ error: error instanceof Error ? error.message : '操作失败' }, 400); }
    } }));
  if (options.timer !== false) { interval = setInterval(tick, 1000); interval.unref?.(); }
  return { state, snapshot, tick, dispose };
}
export async function apply(ctx) { await createHost(ctx); }
