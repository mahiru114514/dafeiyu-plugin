// Shared by the browser bundle and deterministic time-boundary tests.
function selectPose({waitingCount=0,dueCount=0,actionPose=null,outcomePose=null,runningCount=0,startupElapsedMs=0,foreground=false,idleMs=0,idleMinutes=10}) {
  if (waitingCount > 0) return 'waiting';
  if (dueCount > 0) return 'health';
  if (['cleanup','folder'].includes(actionPose)) return actionPose;
  if (['complete','error','cancel'].includes(outcomePose)) return outcomePose;
  if (runningCount > 0) return 'working';
  if (startupElapsedMs < 300000) return 'welcome';
  if (foreground && idleMs >= idleMinutes * 60000) return 'sleep';
  return 'idle';
}
class ActionPose {
  constructor(clock){this.clock=clock;this.busy=false;this.until=0;}
  startFolder(){this.busy=true;this.until=0;}
  endFolder(success){this.busy=false;this.until=success?this.clock()+10000:0;}
  clear(){this.busy=false;this.until=0;}
  pose(cleanupOpen){return this.busy||this.clock()<this.until?'folder':cleanupOpen?'cleanup':null;}
}
class Outcome {
  constructor(clock) { this.clock=clock; this.generation=null; this.cursor=0; this.runningCount=0; this.until=0; this.kind=null;this.noticeId=0; }
  observe(state) {
    if (this.generation !== state.generation) {
      this.generation=state.generation; this.cursor=state.cursor; this.runningCount=state.runningCount; this.dismiss(); return;
    }
    if (state.cursor < this.cursor) return;
    const newWorkCursor=state.newWorkCursor??0;
    if (state.runningCount > this.runningCount||(this.kind&&newWorkCursor>=this.noticeId)) this.dismiss();
    const ending=state.notices.filter(n=>n.id>Math.max(this.cursor,newWorkCursor) && ['complete','error','cancel'].includes(n.kind)).at(-1);
    if (ending) { this.kind=ending.kind;this.noticeId=ending.id; this.until=this.clock()+20000; }
    this.cursor=state.cursor; this.runningCount=state.runningCount;
  }
  pose() { return this.clock()<this.until ? this.kind : null; }
  dismiss() { this.until=0; this.kind=null; }
}
class Presence {
  constructor(clock, foreground) { this.clock=clock; this.foreground=foreground; this.lastActivity=clock(); }
  activity() { if (this.foreground) this.lastActivity=this.clock(); }
  focus(foreground) { this.foreground=foreground; this.lastActivity=this.clock(); }
  snapshot() { return {foreground:this.foreground,idleMs:this.foreground ? Math.max(0,this.clock()-this.lastActivity) : 0}; }
}
exports.selectPose=selectPose;
exports.Presence=Presence;
exports.Outcome=Outcome;
exports.ActionPose=ActionPose;
exports.poses={sleep:{row:0},welcome:{row:1},waiting:{sheet:'reminders',rows:2,row:0},health:{sheet:'reminders',rows:2,row:1},complete:{sheet:'complete',columns:2,rows:2,row:0},error:{sheet:'endings',rows:2,row:0},cancel:{sheet:'endings',rows:2,row:1},cleanup:{sheet:'tools',rows:2,row:0},folder:{sheet:'tools',rows:2,row:1},working:{row:3},idle:{row:4}};
