export const defaults = Object.freeze({
  completionSound: true, waitSound: true, healthSound: false, volume: 0.35,
  quiet: false, waterEnabled: true, restEnabled: true,
  waterMinutes: 120, restMinutes: 120, idleSleepMinutes: 10, reducedMotion: false,
});
export function validateSettings(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw Error('设置必须是对象');
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(defaults, key)) throw Error('未知设置：' + key);
    if (key.endsWith('Minutes')) {
      if (!Number.isInteger(value) || value < 1 || value > 1440) throw Error('提醒间隔需为 1–1440 分钟');
    } else if (key === 'volume') {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw Error('音量需在 0–100% 之间');
    } else if (typeof value !== 'boolean') throw Error('开关值不正确：' + key);
  }
  return patch;
}
export function dayKey(wall) {
  const d = new Date(wall);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function nonnegative(n) { return Number.isFinite(n) && n >= 0; }
export class PetState {
  constructor({ mono, wall, saved } = {}) {
    this.mono = mono ?? 0; this.wall = wall ?? Date.now();
    this.settings = { ...defaults }; this.days = Object.create(null);
    this.elapsed = { water: 0, rest: 0 }; this.targets = { water: 7200000, rest: 7200000 };
    this.running = new Set(); this.waiting = new Map(); this.notices = []; this.seen = new Set(); this.seq = 0;
    this.newWorkCursor=0;
    this.due = new Set();
    if (saved) {
      if (saved.version !== 1) throw Error('统计文件版本不兼容');
      validateSettings(saved.settings);
      if (!saved.days || !saved.elapsed || !saved.targets) throw Error('统计文件结构不完整');
      for (const [k, v] of Object.entries(saved.days)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !nonnegative(v)) throw Error('每日统计损坏');
        this.days[k] = v;
      }
      for (const k of ['water', 'rest']) {
        if (!nonnegative(saved.elapsed[k]) || !nonnegative(saved.targets[k])) throw Error('提醒统计损坏');
      }
      this.settings = { ...defaults, ...saved.settings };
      this.elapsed = { ...saved.elapsed }; this.targets = { ...saved.targets };
    }
  }
  tick(mono, wall) {
    const delta = mono - this.mono, previousWall = this.wall;
    this.mono = mono; this.wall = wall;
    if (this.running.size && delta > 0 && delta <= 15000) {
      // Use monotonic elapsed time; split by wall clock only when it stayed consistent.
      if (Math.abs(wall - previousWall - delta) < 60000 && wall >= previousWall) {
        let cursor = previousWall, left = delta;
        while (left > 0) {
          const d = new Date(cursor); d.setHours(24, 0, 0, 0);
          const portion = Math.min(left, d.getTime() - cursor);
          const key = dayKey(cursor); this.days[key] = (this.days[key] ?? 0) + portion;
          cursor += portion; left -= portion;
        }
      } else {
        const key = dayKey(wall); this.days[key] = (this.days[key] ?? 0) + delta;
      }
      this.elapsed.water += delta; this.elapsed.rest += delta;
    }
    this.checkDue();
  }
  setRunning(id, running) {
    if(running){if(!this.running.has(id))this.newWorkCursor=this.seq;this.running.add(id);}
    else this.running.delete(id);
  }
  checkDue() {
    const fresh = [];
    for (const k of ['water', 'rest']) {
      if (this.settings[k + 'Enabled'] && this.elapsed[k] >= this.targets[k]) {
        if (!this.due.has(k)) { this.due.add(k); fresh.push(k); }
      } else this.due.delete(k);
    }
    if (fresh.length) this.notice('health', null, fresh.includes('water') && fresh.includes('rest')
      ? '提醒时间到啦，喝杯水，也休息一下吧。'
      : fresh[0] === 'water' ? '喝杯水吧，给自己补充一点能量。' : '休息一下吧，站起来活动活动。');
  }
  configure(patch) {
    validateSettings(patch); this.settings = { ...this.settings, ...patch };
    for (const k of ['water', 'rest']) {
      if (Object.hasOwn(patch, k + 'Minutes')) this.targets[k] = this.settings[k + 'Minutes'] * 60000;
    }
    this.checkDue();
  }
  ack(k) {
    if (!['water', 'rest'].includes(k)) throw Error('未知提醒');
    this.elapsed[k] = 0; this.targets[k] = this.settings[k + 'Minutes'] * 60000; this.due.delete(k);
  }
  snooze(k) {
    if (!['water', 'rest'].includes(k)) throw Error('未知提醒');
    this.targets[k] = this.elapsed[k] + 600000; this.due.delete(k);
  }
  notice(kind, sessionId, message, key) {
    if (key && this.seen.has(key)) return;
    if (key) { this.seen.add(key); if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value); }
    this.notices.push({ id: ++this.seq, kind, sessionId, message, at: this.wall });
    if (this.notices.length > 100) this.notices.shift();
  }
  wait(key, sessionId, ownerId = sessionId) {
    if (this.waiting.has(key)) return;
    this.waiting.set(key, { key, sessionId, ownerId });
    this.notice('wait', sessionId, '需要你确认一下，我才能继续。', key);
  }
  resolveWait(key) { this.waiting.delete(key); }
  clearWaits(sessionId) {
    for (const [key, item] of this.waiting) if (item.sessionId === sessionId || item.ownerId === sessionId) this.waiting.delete(key);
  }
  serialize() {
    return { version: 1, settings: { ...this.settings }, days: { ...this.days }, elapsed: { ...this.elapsed }, targets: { ...this.targets } };
  }
  snapshot() {
    return { today: dayKey(this.wall), todayMs: this.days[dayKey(this.wall)] ?? 0,
      runningCount: this.running.size, waiting: [...this.waiting.values()], settings: { ...this.settings },
      newWorkCursor:this.newWorkCursor,
      due: [...this.due], waterElapsedMs: this.elapsed.water, restElapsedMs: this.elapsed.rest,
      waterRemainingMs: Math.max(0, this.targets.water - this.elapsed.water),
      restRemainingMs: Math.max(0, this.targets.rest - this.elapsed.rest),
      notices: [...this.notices], cursor: this.seq };
  }
}
