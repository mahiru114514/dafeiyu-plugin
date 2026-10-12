const React = require('react');
const { createElement: h, useState, useEffect, useRef } = React;
const petCss = __PET_CSS__;
const petImage = __PET_IMAGE__;
const reminderImage = __PET_REMINDERS_IMAGE__;
const completeImage = __PET_COMPLETE_IMAGE__;
const endingsImage = __PET_ENDINGS_IMAGE__;
const toolsImage = __PET_TOOLS_IMAGE__;
const { selectPose, Presence, Outcome,ActionPose, poses } = __PET_APPEARANCE__;
const { AudioManager, noticeSoundEnabled } = __PET_AUDIO__;
const { menuPosition } = __PET_MENU__;
const {currentSessionId,ProjectSelection}=__PET_PROJECT__;
const {toolAvailability}=__PET_CONNECTION__;
const clientVersion=__PET_VERSION__;
function duration(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function remaining(ms) { return ms <= 0 ? '提醒时间到了' : `${Math.ceil(ms / 60000)} 分钟后`; }
function savedPosition() {
  try { const p = JSON.parse(localStorage.getItem('harness-pet-position')); if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return p; } catch {}
  return { x: Math.max(8, innerWidth - 128), y: Math.max(64, innerHeight - 350) };
}
function clamp(p) { return { x: Math.max(8, Math.min(innerWidth - 112, p.x)), y: Math.max(64, Math.min(innerHeight - 150, p.y)) }; }
function Pet({ ctx, appearanceClock = () => performance.now(), foregroundCheck = () => document.hasFocus() && !document.hidden }) {
  const [state, setState] = useState(null), [error, setError] = useState(''), [open, setOpen] = useState(false);
  const [panelMode,setPanelMode]=useState('settings'),[contextMenu,setContextMenu]=useState(null);
  const menuRef=useRef(null),petRef=useRef(null),portInputRef=useRef(null),confirmRef=useRef(null),confirmOrigin=useRef(null);
  const [portInspection,setPortInspection]=useState(null),[selectedProcess,setSelectedProcess]=useState(null);
  const currentSession=()=>currentSessionId(ctx.sessions?.list);
  const [projectSession,setProjectSession]=useState(currentSession),projectSessionRef=useRef(projectSession),scannedSession=useRef(undefined);
  const projectChoice=useRef(null),[projectRevision,setProjectRevision]=useState(0);
  if(!projectChoice.current)projectChoice.current=new ProjectSelection(projectSession);
  projectSessionRef.current=projectSession;
  const [portsBusy,setPortsBusy]=useState(false),[portError,setPortError]=useState(''),[portMessage,setPortMessage]=useState('');
  const portOperation=useRef(false);
  const [folderBusy,setFolderBusy]=useState(false),[folderMessage,setFolderMessage]=useState(null),folderOperation=useRef(false);
  const [position, setPosition] = useState(() => clamp(savedPosition())), [collapsed, setCollapsed] = useState(false);
  const [audioReady, setAudioReady] = useState(false), [audioError, setAudioError] = useState('');
  const [audioFiles, setAudioFiles] = useState({}), [audioBusy, setAudioBusy] = useState(false), [audioMessage, setAudioMessage] = useState('');
  const audioOperation = useRef(false), completeInput = useRef(null), waitInput = useRef(null);
  const [dismissed, setDismissed] = useState(0), [notice, setNotice] = useState(null);
  const audio = useRef(null), tracking = useRef({ generation: null, cursor: 0 }), drag = useRef(null), skippedClick = useRef(false);
  const active = useRef(true), latest = useRef(null), controllers = useRef(new Set()), requestSeq = useRef(0), acceptedSeq = useRef(0);
  const actions = useRef(Promise.resolve());
  const presence = useRef(null);
  const outcome = useRef(null);
  const toolPose=useRef(null);
  if(!toolPose.current)toolPose.current=new ActionPose(appearanceClock);
  if (!outcome.current) outcome.current = new Outcome(appearanceClock);
  if (!presence.current) presence.current = new Presence(appearanceClock, foregroundCheck());
  const [activityState, setActivityState] = useState(() => presence.current.snapshot());
  if (!audio.current) audio.current = new AudioManager();
  latest.current = state;
  const endpoint = path => new URL('api/harness-pet/' + path, document.baseURI).href;
  async function request(path, body) {
    const sequence = ++requestSeq.current;
    const controller = new AbortController(); controllers.current.add(controller);
    const timeout = setTimeout(() => controller.abort(), ['scan-project','release-project'].includes(body?.type)?45000:body?.type==='open-workspace'?15000:5000);
    try {
      const response = await fetch(endpoint(path), { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
      const value = await response.json(); if (!response.ok) throw Error(value.error || `连接失败（${response.status}）`); return { value, sequence };
    } finally { clearTimeout(timeout); controllers.current.delete(controller); }
  }
  function accept({ value, sequence }) {
    if (!active.current) return;
    if (sequence < acceptedSeq.current) return;
    acceptedSeq.current = sequence;
    outcome.current.observe(value);
    const previous = tracking.current;
    if (previous.generation !== value.generation) {
      tracking.current = { generation: value.generation, cursor: value.cursor };
      setNotice(null); setDismissed(0);
    }
    else if (value.cursor >= previous.cursor) {
      const fresh = value.notices.filter(n => n.id > previous.cursor &&
        (n.kind !== 'wait' || value.waiting.some(w => w.sessionId === n.sessionId)));
      tracking.current.cursor = value.cursor;
      if (fresh.length) {
        const last = fresh.findLast(n => n.kind === 'wait') || fresh[fresh.length - 1]; setNotice(last);
        const settings = value.settings;
        if (noticeSoundEnabled(last.kind, settings, document.hasFocus() && !document.hidden)) {
          if (!audio.current.play(last.kind, settings.volume)) { setAudioReady(false); setAudioError('点击“开启声音”后，后台提示音才会生效。'); }
        }
      }
    }
    setState(value); setError('');
  }
  function action(body) {
    actions.current = actions.current.then(async () => {
      if (!active.current) return;
      try { accept(await request('action', body)); }
      catch (e) { if (active.current) setError(e.message || '保存失败'); }
    });
    return actions.current;
  }
  function portAction(body) {
    if(portOperation.current)return;
    const selection=projectChoice.current.snapshot();
    portOperation.current=true;setPortsBusy(true);setPortError('');setPortMessage('');
    actions.current=actions.current.then(async()=>{
      try {
        if(!active.current)return;
        if(!projectChoice.current.matches(selection)||body.sessionId!==projectSessionRef.current||(body.type==='release-project'&&!projectChoice.current.matches({id:body.sessionId,revision:body.revision})))throw Error('项目已切换，请重新扫描。');
        const result=await request('action',body);
        if(active.current&&projectChoice.current.matches(selection)){accept(result);setPortInspection({...result.value.portInspection,selectionRevision:selection.revision});setPortMessage(result.value.portInspection?.message||'');setSelectedProcess(null);}
      } catch(e) {
        if(active.current&&projectChoice.current.matches(selection)){setPortError(e.name==='AbortError'?'操作超时，请重新扫描确认结果。':e.message||'端口操作失败，请重新扫描。');setPortInspection(null);setSelectedProcess(null);}
      } finally {portOperation.current=false;if(active.current)setPortsBusy(false);}
    });
    return actions.current;
  }
  function showContextMenu(e) {
    e.preventDefault();const r=e.currentTarget.getBoundingClientRect();
    setFolderMessage(null);
    setContextMenu(menuPosition({x:e.clientX||r.left,y:e.clientY||r.bottom},{width:208,height:270},{width:innerWidth,height:innerHeight}));
  }
  function openWorkspace() {
    if(folderOperation.current)return;
    const availability=toolAvailability(latest.current,'folders',projectSessionRef.current);
    if(!availability.ready){setFolderMessage({text:availability.message,error:true});return;}
    const selection=projectChoice.current.snapshot();folderOperation.current=true;toolPose.current.startFolder();setCollapsed(false);setFolderBusy(true);setFolderMessage(null);
    actions.current=actions.current.then(async()=>{
      let success=false;
      try {
        if(!active.current||!projectChoice.current.matches(selection))return;
        const result=await request('action',{type:'open-workspace',sessionId:selection.id});
        if(active.current&&projectChoice.current.matches(selection)){
          success=true;
          accept(result);setFolderMessage({text:result.value.folderResult.simulated?'预览已模拟打开文件夹：'+result.value.folderResult.folderPath:'已打开工作区文件夹。',error:false});
        }
      } catch(e){if(active.current&&projectChoice.current.matches(selection))setFolderMessage({text:e.name==='AbortError'?'打开超时，请重试。':e.message||'打开文件夹失败。',error:true});}
      finally{toolPose.current.endFolder(success);folderOperation.current=false;if(active.current)setFolderBusy(false);}
    });return actions.current;
  }
  function showPorts(){scannedSession.current=undefined;setCollapsed(false);setContextMenu(null);setPanelMode('ports');setOpen(true);setPortError('');setPortMessage('');setPortInspection(null);setSelectedProcess(null);}
  function scanProject(){const availability=toolAvailability(latest.current,'ports',projectSessionRef.current);if(!availability.ready){setPortError(availability.message);return;}setSelectedProcess(null);void portAction({type:'scan-project',sessionId:projectSessionRef.current});}
  async function enableAudio(kind, force) {
    try {
      const ready = await audio.current.unlock(); if (!active.current) return;
      setAudioReady(ready); setAudioFiles({ ...audio.current.clips }); setAudioError(ready ? audio.current.warning : '声音暂不可用，请再试一次。');
      if (force && ready) audio.current.play(kind, latest.current?.settings.volume ?? 0.35, true);
    } catch { if (active.current) setAudioError('声音暂不可用，视觉提醒仍会保留。'); }
  }
  async function changeAudio(kind, file) {
    if (audioOperation.current) return;
    audioOperation.current = true; setAudioBusy(true); setAudioMessage('');
    try {
      if (file) { await audio.current.unlock(); await audio.current.importClip(kind, file); }
      else await audio.current.resetClip(kind);
      if (!active.current) return;
      setAudioFiles({ ...audio.current.clips }); setAudioReady(audio.current.ready); setAudioError(audio.current.warning);
      setAudioMessage(file ? '音频已保存，可点击试听。' : '已恢复内置提示音。');
    } catch (e) { if (active.current) setAudioError(e.message || '音频导入失败'); }
    finally { audioOperation.current = false; if (active.current) setAudioBusy(false); }
  }
  useEffect(() => {
    active.current = true; let timer, stopped = false;
    const poll = async () => {
      try { accept(await request('state')); }
      catch (e) { if (!stopped) setError('连接中断，正在重试。'); }
      if (!stopped) timer = setTimeout(poll, 1000);
    };
    void poll();
    void audio.current.load().then(() => { if (active.current) { setAudioFiles({ ...audio.current.clips }); setAudioError(audio.current.warning); } });
    const resize = () => setPosition(p => clamp(p)); window.addEventListener('resize', resize);
    return () => { stopped = true; active.current = false; clearTimeout(timer); window.removeEventListener('resize', resize);
      for (const c of controllers.current) c.abort(); audio.current.close(); };
  }, []);
  useEffect(() => { try { localStorage.setItem('harness-pet-position', JSON.stringify(position)); } catch {} }, [position]);
  useEffect(()=>{
    if(!contextMenu)return;
    menuRef.current?.querySelector('button:not(:disabled)')?.focus();
    const outside=e=>{if(!menuRef.current?.contains(e.target))setContextMenu(null);};
    const key=e=>{if(e.key==='Escape'){e.preventDefault();setContextMenu(null);petRef.current?.focus();}};
    const resize=()=>setContextMenu(point=>{if(!point)return null;const p=menuPosition(point,{width:208,height:270},{width:innerWidth,height:innerHeight});return p.x===point.x&&p.y===point.y?point:p;});
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);window.addEventListener('resize',resize);
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true);window.removeEventListener('resize',resize);};
  },[contextMenu]);
  useEffect(()=>{if(open&&panelMode==='ports')portInputRef.current?.focus();},[open,panelMode]);
  useEffect(()=>{
    const store=ctx.sessions?.list;if(!store)return;
    const update=()=>{const id=currentSession();projectSessionRef.current=id;if(projectChoice.current.select(id)){toolPose.current.clear();setProjectSession(id);setProjectRevision(projectChoice.current.revision);}};
    update();return store.subscribe(update);
  },[ctx]);
  useEffect(()=>{setPortInspection(null);setSelectedProcess(null);setPortMessage('');setPortError('');setFolderMessage(null);},[projectRevision]);
  useEffect(()=>{
    if(open&&panelMode==='ports'&&!portsBusy&&scannedSession.current!==projectRevision&&toolAvailability(state,'ports',projectSession).ready){
      scannedSession.current=projectRevision;
      if(!projectSession)setPortError('请先打开当前项目的会话。');else scanProject();
    }
  },[open,panelMode,projectSession,projectRevision,portsBusy,!!state,state?.portsSupported]);
  useEffect(()=>{
    if(selectedProcess){(confirmRef.current?.querySelector('button:not(:disabled)')||confirmRef.current)?.focus();}
    else if(confirmOrigin.current){const origin=confirmOrigin.current;confirmOrigin.current=null;
      if(origin.isConnected)origin.focus();else (portInputRef.current||petRef.current)?.focus();}
  },[selectedProcess,portsBusy]);
  useEffect(() => {
    const activity = () => { presence.current.activity(); setActivityState(presence.current.snapshot()); };
    const focus = () => { presence.current.focus(foregroundCheck()); setActivityState(presence.current.snapshot()); };
    const timer = setInterval(() => setActivityState(presence.current.snapshot()), 1000);
    for (const event of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(event, activity, {capture:true,passive:true});
    window.addEventListener('focus', focus); window.addEventListener('blur', focus); document.addEventListener('visibilitychange', focus);
    return () => {
      clearInterval(timer);
      for (const event of ['pointerdown', 'keydown', 'wheel']) document.removeEventListener(event, activity, true);
      window.removeEventListener('focus', focus); window.removeEventListener('blur', focus); document.removeEventListener('visibilitychange', focus);
    };
  }, []);
  const settings = state?.settings, waiting = state?.waiting ?? [], due = state?.due ?? [];
  const portAvailability=toolAvailability(state,'ports',projectSession);
  const freshNotice = notice && notice.id > dismissed && notice.kind !== 'health' &&
    (notice.kind !== 'wait' || waiting.length) ? notice : null;
  const bubbleText = waiting.length ? '需要你确认一下' : due.length ? (due.length === 2 ? '喝水、休息时间到啦' : due[0] === 'water' ? '喝水时间到啦' : '休息时间到啦') : freshNotice?.message;
  const pose = selectPose({waitingCount:waiting.length,dueCount:due.length,actionPose:toolPose.current.pose(open&&panelMode==='ports'),outcomePose:outcome.current.pose(),runningCount:state?.runningCount ?? 0,startupElapsedMs:state?.startupElapsedMs ?? 0,...activityState,idleMinutes:settings?.idleSleepMinutes ?? 10});
  const poseConfig = poses[pose], poseRows = poseConfig.rows ?? 5;
  function openSession(id) { try { if (id) ctx.uiWorkspace.openSession(id); } catch { setError('请在左侧找到需要处理的会话。'); } }
  const configure = patch => action({ type: 'configure', patch });
  const audioControl = (kind, label, input) => h('div', { className: 'hp-audio-file', key: kind },
    h('div', { className: 'hp-audio-name' }, h('strong', null, label), h('span', { title: audioFiles[kind]?.name }, audioFiles[kind]?.name ?? '内置提示音')),
    h('input', { ref: input, type: 'file', hidden: true, accept: '.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm,audio/*', 'aria-label': '选择' + label + '文件',
      onChange: e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void changeAudio(kind, file); } }),
    h('div', { className: 'hp-samples' },
      h('button', { disabled: audioBusy, onClick: () => input.current?.click() }, '导入' + label),
      h('button', { disabled: audioBusy, onClick: () => void enableAudio(kind, true) }, '试听' + label),
      h('button', { disabled: audioBusy || !audioFiles[kind] && !audio.current.warning, onClick: () => void changeAudio(kind, null), 'aria-label': label + '恢复默认' }, '恢复默认')));
  const check = (key, label, detail) => h('label', { className: 'hp-option', key },
    h('span', null, h('strong', null, label), detail && h('small', null, detail)),
    h('input', { type: 'checkbox', checked: settings?.[key] ?? false, disabled: !state, onChange: e => void configure({ [key]: e.target.checked }) }));
  const intervalInput = (kind, label) => h('label', { className: 'hp-interval', key: kind },
    h('span', null, label), h('input', { type: 'number', min: 1, max: 1440, key: settings?.[kind + 'Minutes'], defaultValue: settings?.[kind + 'Minutes'] ?? 120,
      disabled: !state, 'aria-label': kind === 'idleSleep' ? '无操作睡觉间隔（分钟）' : (kind === 'water' ? '喝水' : '休息') + '提醒间隔（分钟）', onBlur: e => { const v = Number(e.target.value); if (v !== settings?.[kind + 'Minutes']) void configure({ [kind + 'Minutes']: v }); } }), h('span', null, '分钟'));
  const pointerDown = e => { if (e.button !== 0) return; drag.current = { x: e.clientX, y: e.clientY, origin: position, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); };
  const pointerMove = e => {
    if (!drag.current) return; const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.current.moved = true;
    if (drag.current.moved) setPosition(clamp({ x: drag.current.origin.x + dx, y: drag.current.origin.y + dy }));
  };
  const petButton = h('button', { className: 'hp-character',ref:petRef,onContextMenu:showContextMenu,
    'data-pose':pose,
    title: '点击查看今日时长；拖动调整位置', 'aria-label': '大肥鱼：打开时长和提醒设置', 'aria-expanded': open,
    onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerCancel: () => { drag.current = null; },
    onPointerUp: () => { skippedClick.current = drag.current?.moved ?? false; drag.current = null; },
    onClick: () => { if (skippedClick.current) { skippedClick.current = false; return; } setContextMenu(null);setPanelMode('settings');setOpen(v => panelMode==='settings'?!v:true); void enableAudio(null, false); },
    onKeyDown: e => { if (!e.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault(); setPosition(p => clamp({ x: p.x + (e.key === 'ArrowRight' ? 10 : e.key === 'ArrowLeft' ? -10 : 0), y: p.y + (e.key === 'ArrowDown' ? 10 : e.key === 'ArrowUp' ? -10 : 0) })); } },
      h('span', {key:pose,className:'hp-sprite hp-'+pose,'aria-hidden':true,style:{backgroundImage:`url("${poseConfig.sheet === 'tools' ? toolsImage : poseConfig.sheet === 'endings' ? endingsImage : poseConfig.sheet === 'complete' ? completeImage : poseConfig.sheet === 'reminders' ? reminderImage : petImage}")`,backgroundSize:`${(poseConfig.columns??4)*100}% ${poseRows*100}%`,backgroundPositionY:`${poseRows>1?poseConfig.row/(poseRows-1)*100:0}%`}}));
  const panel = open && panelMode==='settings' && h('section', { className: 'hp-panel', 'aria-label': '大肥鱼设置',
    style: { left: Math.max(8, Math.min(innerWidth - 338, position.x - 370)), top: Math.max(64, Math.min(innerHeight - 560, position.y - 390)) } },
    h('header', { className: 'hp-header' }, h('div', null, h('span', { className: 'hp-kicker' }, 'HARNESS COMPANION'), h('h2', null, '大肥鱼')), h('button', { className: 'hp-icon', 'aria-label': '关闭面板', onClick: () => setOpen(false) }, '×')),
    h('div', { className: 'hp-time' }, h('span', null, '今日 Agent 运行时长'), h('strong', null, duration(state?.todayMs ?? 0)),
      h('div', { className: 'hp-status' }, h('i', { className: state?.runningCount ? 'hp-dot hp-live' : 'hp-dot' }), waiting.length ? `${waiting.length} 个请求等待确认` : state?.runningCount ? `${state.runningCount} 个 Agent 正在运行` : state ? '现在可以安心休息' : '正在连接 Harness…'),
      h('small', null, '后台运行也计时 · 并发时间只记一次')),
    due.length > 0 && h('div', { className: 'hp-reminder' }, h('strong', null, '照顾一下自己吧'),
      due.map(kind => h('div', { className: 'hp-reminder-row', key: kind }, h('span', null, kind === 'water' ? '喝一杯水' : '休息、活动一下'),
        h('button', { onClick: () => void action({ type: 'ack', kind }) }, kind === 'water' ? '已喝水' : '已休息'),
        h('button', { onClick: () => void action({ type: 'snooze', kind }) }, '稍后 10 分钟')))),
    waiting.length > 0 && h('button', { className: 'hp-primary', onClick: () => openSession(waiting[0].sessionId) }, '去处理确认 →'),
    h('div', { className: 'hp-section' }, h('h3', null, '声音提醒'), check('completionSound', '运行结束', '完成或遇到错误时响铃'), check('waitSound', '需要确认', '审批、提问时提醒一次'), check('quiet', '勿扰模式', '关闭所有提醒声音'),
      h('label', { className: 'hp-volume' }, h('span', null, '音量'), h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: settings?.volume ?? 0.35, disabled: !state, 'aria-label': '提示音音量', onChange: e => void configure({ volume: Number(e.target.value) }) }), h('span', null, `${Math.round((settings?.volume ?? 0.35) * 100)}%`)),
      audioControl('complete', '完成音', completeInput), audioControl('wait', '确认音', waitInput),
      h('small', { className: 'hp-audio-hint' }, 'MP3、WAV 等 · 每个 ≤ 5 MB / 30 秒 · 建议用短音频'),
      !audioReady && h('small', { className: 'hp-audio-hint' }, '点击伙伴或试听，开启本次窗口的声音提醒'),
      (audioBusy || audioMessage) && h('small', { className: 'hp-audio-feedback', role: 'status' }, audioBusy ? '正在读取、保存音频…' : audioMessage)),
    h('div', { className: 'hp-section' }, h('h3', null, '喝水与休息'), check('waterEnabled', '喝水提醒'), intervalInput('water', '每累计运行'),
      h('small', { className: 'hp-next' }, '下次喝水：' + remaining(state?.waterRemainingMs ?? 7200000)),
      check('restEnabled', '休息提醒'), intervalInput('rest', '每累计运行'), h('small', { className: 'hp-next' }, '下次休息：' + remaining(state?.restRemainingMs ?? 7200000)),
      check('healthSound', '健康提醒声音', '仅在 Harness 前台时响铃'), check('reducedMotion', '减少动画')),
    (error || audioError || state?.storageError||state?.pendingError) && h('p', { className: 'hp-error', role: 'status' }, error || state?.storageError||state?.pendingError || audioError),
    h('footer', null, h('span', null, '陪你工作，也记得照顾自己'), h('button', { onClick: () => { setOpen(false); setCollapsed(true); } }, '收起伙伴')));
  const portPanel=open&&panelMode==='ports'&&h('section',{className:'hp-panel hp-port-panel','aria-label':'进程与端口',style:{left:Math.max(8,Math.min(innerWidth-338,position.x-370)),top:Math.max(64,Math.min(innerHeight-560,position.y-390))}},
    h('header',{className:'hp-header'},h('div',null,h('span',{className:'hp-kicker'},'LOCAL PROJECT'),h('h2',null,'进程与端口')),h('button',{className:'hp-icon','aria-label':'关闭面板',onClick:()=>{setOpen(false);setSelectedProcess(null);}},'×')),
    h('p',{className:'hp-port-intro'},'自动查找当前项目的服务，选择进程即可释放它占用的全部 TCP 端口。'),
    portInspection&&h('p',{className:'hp-project-path'},portInspection.projectPath),
    h('button',{ref:portInputRef,className:'hp-primary',disabled:portsBusy||!!selectedProcess||!portAvailability.ready,onClick:scanProject},portsBusy?'正在处理…':'重新扫描'),
    !portAvailability.ready&&h('p',{className:'hp-error',role:'status'},portAvailability.message),
    h('p',{className:'hp-port-hint'},'仅列出程序或入口脚本路径属于当前项目的服务。相对路径、模块启动的服务可能无法识别。结果 90 秒内有效。'),
    h('p',{className:'hp-port-hint'},`界面 ${clientVersion} · 后台 ${state?.pluginVersion??'旧版或未连接'}`),
    portError&&h('p',{className:'hp-error',role:'alert'},portError),
    portMessage&&h('p',{className:'hp-port-result',role:'status'},portMessage),
    portInspection?.simulated&&h('p',{className:'hp-port-hint'},'预览使用模拟进程，不会结束电脑上的真实进程。'),
    portInspection&&h('div',{className:'hp-port-list'},h('h3',null,`找到 ${portInspection.owners.length} 个项目服务`),
      !portInspection.owners.length?h('p',{className:'hp-port-result',role:'status'},'未发现可确认归属的项目服务。'):portInspection.owners.map(owner=>h('article',{className:'hp-process',key:owner.pid},
        h('div',{className:'hp-process-title'},h('strong',null,owner.name),h('span',null,`PID ${owner.pid}`)),
        h('p',{className:'hp-process-ports'},'TCP '+owner.ports.join(' · ')),
        h('p',{className:'hp-process-path'},owner.path||'程序路径不可读取'),
        h('small',null,owner.evidence+' · '+owner.addresses?.join('、')),
        owner.canTerminate?h('button',{className:'hp-danger',disabled:portsBusy||!!selectedProcess,onClick:e=>{confirmOrigin.current=e.currentTarget;setSelectedProcess({...owner,sessionId:portInspection.sessionId,revision:portInspection.selectionRevision});}},'释放端口'):h('p',{className:'hp-port-hint'},owner.blockedReason)))),
    selectedProcess&&h('section',{ref:confirmRef,tabIndex:-1,className:'hp-process-confirm',role:'alertdialog','aria-modal':true,'aria-label':`确认结束 PID ${selectedProcess.pid}`,onKeyDown:e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!portsBusy)setSelectedProcess(null);}
      if(e.key==='Tab'){const buttons=Array.from(e.currentTarget.querySelectorAll('button:not(:disabled)'));
        if(!buttons.length){e.preventDefault();return;}
        if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1).focus();}
        else if(!e.shiftKey&&document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0].focus();}}
    }},
      h('strong',null,`释放 ${selectedProcess.name} 的端口？`),h('p',null,`PID ${selectedProcess.pid} · TCP ${selectedProcess.ports.join('、')}`),
      h('p',null,'这会中断该进程正在执行的任务。请确认它是你要清理的项目服务。'),
      h('div',{className:'hp-confirm-actions'},h('button',{disabled:portsBusy,onClick:()=>setSelectedProcess(null)},'取消'),h('button',{className:'hp-danger',disabled:portsBusy,onClick:()=>void portAction({type:'release-project',sessionId:selectedProcess.sessionId,revision:selectedProcess.revision,token:selectedProcess.token})},portsBusy?'正在释放…':'确认释放'))));
  const menu=contextMenu&&h('div',{ref:menuRef,className:'hp-context-menu',role:'menu','aria-label':'大肥鱼快捷菜单',style:{left:contextMenu.x,top:contextMenu.y,maxHeight:Math.max(40,innerHeight-contextMenu.y-8)},onKeyDown:e=>{
    const items=Array.from(e.currentTarget.querySelectorAll('button:not(:disabled)')),i=items.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
  }},
    h('button',{role:'menuitem',disabled:folderBusy,onClick:openWorkspace},folderBusy?'正在打开文件夹…':'打开当前工作区文件夹'),
    h('button',{role:'menuitem',onClick:showPorts},'清理占用端口…'),
    h('button',{role:'menuitem',onClick:()=>{setContextMenu(null);setPanelMode('settings');setOpen(true);}},'打开设置'),
    h('button',{role:'menuitemcheckbox','aria-checked':settings?.quiet??false,disabled:!state,onClick:()=>{setContextMenu(null);void configure({quiet:!settings.quiet});}},settings?.quiet?'✓ 勿扰模式':'勿扰模式'),
    h('button',{role:'menuitem',onClick:()=>{setContextMenu(null);setOpen(false);setCollapsed(v=>!v);setSelectedProcess(null);}},collapsed?'展开宠物':'收起宠物'),
    folderMessage&&h('p',{className:'hp-folder-feedback'+(folderMessage.error?' hp-folder-failed':''),role:folderMessage.error?'alert':'status'},folderMessage.text));
  return h('div', { className: 'harness-pet' + (settings?.reducedMotion ? ' hp-still' : '') + (!activityState.foreground ? ' hp-paused' : '') },
    collapsed ? h('button', {ref:petRef,onContextMenu:showContextMenu, className: 'hp-collapsed', style: { left: position.x, top: position.y }, 'aria-label': '展开大肥鱼', onClick: () => {setContextMenu(null);setCollapsed(false);} }, '鲸', (waiting.length || due.length || freshNotice) && h('i', { className: 'hp-badge' })) :
      h('div', { className: 'hp-pet', style: { left: position.x, top: position.y } },
        bubbleText && h('button', { className: 'hp-bubble', style: { left: position.x < 160 ? 0 : undefined, right: position.x < 160 ? 'auto' : undefined, top: position.y < 160 ? 'calc(100% + 30px)' : undefined, bottom: position.y < 160 ? 'auto' : undefined }, onClick: () => { if (waiting.length) openSession(waiting[0].sessionId);setPanelMode('settings');setOpen(true); }, title: '查看提醒' }, bubbleText),
        petButton,
        freshNotice && !waiting.length && h('button', { className: 'hp-dismiss', 'aria-label': '关闭当前提醒', onClick: () => { outcome.current.dismiss(); setDismissed(freshNotice.id); } }, '×')),
    panel,portPanel,menu);
}
exports.inject = ['slots', 'uiWorkspace', 'sessions'];
exports.apply = function apply(ctx) {
  ctx.effect(() => { const style = document.createElement('style'); style.textContent = petCss; document.head.append(style); return () => style.remove(); });
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'harness-pet' }, () => h(Pet, { ctx })));
};
exports.Pet = Pet;
