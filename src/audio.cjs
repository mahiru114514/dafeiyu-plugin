const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SECONDS = 30;
function slotKey(kind) {
  if (!['complete', 'wait'].includes(kind)) throw Error('未知提示音类型');
  return kind;
}
function createClipStore() {
  let opening, closed = false;
  const database = () => opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('harness-pet-audio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('clips');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('音频存储正被其他窗口占用'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (closed) { db.close(); reject(Error('插件已关闭')); } else resolve(db);
    };
  });
  async function transaction(key, mode, operation) {
    const db = await database(); if (closed) throw Error('插件已关闭');
    return new Promise((resolve, reject) => {
      const tx = db.transaction('clips', mode), request = operation(tx.objectStore('clips'), key);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error || Error('音频保存失败'));
    });
  }
  return {
    get: key => transaction(key, 'readonly', (store, k) => store.get(k)),
    put: (key, value) => transaction(key, 'readwrite', (store, k) => store.put(value, k)),
    remove: key => transaction(key, 'readwrite', (store, k) => store.delete(k)),
    close() { closed = true; if (opening) void opening.then(db => db.close()).catch(() => {}); },
  };
}
class AudioManager {
  constructor({ contextFactory = () => new (window.AudioContext || window.webkitAudioContext)(), store = createClipStore(), now = () => performance.now() } = {}) {
    this.contextFactory = contextFactory; this.store = store; this.now = now;
    this.clips = {}; this.buffers = {}; this.sources = new Set(); this.lastSound = -Infinity;
    this.warning = ''; this.closed = false;
  }
  get ready() { return !this.closed && this.context?.state === 'running'; }
  ensureContext() { if (this.closed) throw Error('插件已关闭'); return this.context ??= this.contextFactory(); }
  async decode(bytes) {
    if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength > MAX_BYTES) throw Error('音频需为非空文件，且不超过 5 MB');
    let buffer;
    try { buffer = await this.ensureContext().decodeAudioData(bytes.slice(0)); }
    catch { throw Error('无法解码该音频，请选择可播放的 MP3、WAV 等文件'); }
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > MAX_SECONDS) throw Error('提示音长度需在 0–30 秒之间');
    return buffer;
  }
  load() {
    return this.loading ??= (async () => {
      for (const key of ['complete', 'wait']) {
        try {
          const record = await this.store.get(key); if (!record) continue;
          const buffer = await this.decode(record.bytes);
          if (this.closed) return;
          this.clips[key] = { name: String(record.name).slice(0, 160), duration: buffer.duration }; this.buffers[key] = buffer;
        } catch { if (!this.closed) this.warning = '自定义提示音恢复失败，暂用内置声音；可重新导入。'; }
      }
    })();
  }
  async unlock() {
    await this.ensureContext().resume(); await this.load(); return this.ready;
  }
  async importClip(key, file) {
    slotKey(key);
    if (!file || !file.size || file.size > MAX_BYTES) throw Error('请选择不超过 5 MB 的非空音频');
    if (!/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(file.name)) throw Error('请选择 MP3、WAV、OGG、M4A、AAC、FLAC 或 WebM 音频');
    await this.load();
    const bytes = await file.arrayBuffer(), buffer = await this.decode(bytes);
    if (this.closed) throw Error('插件已关闭');
    const name = String(file.name).slice(0, 160);
    try { await this.store.put(key, { name, bytes }); } catch { throw Error('音频保存失败，之前的提示音已保留'); }
    if (this.closed) return;
    this.clips[key] = { name, duration: buffer.duration }; this.buffers[key] = buffer; this.warning = '';
  }
  async resetClip(key) {
    slotKey(key); await this.load();
    try { await this.store.remove(key); } catch { throw Error('恢复默认失败，请重试'); }
    this.stop(); delete this.clips[key]; delete this.buffers[key]; this.warning = '';
  }
  stop() {
    for (const source of this.sources) { try { source.stop(); } catch {} }
    this.sources.clear();
  }
  track(source, gain) {
    this.sources.add(source);
    source.onended = () => { this.sources.delete(source); source.disconnect(); gain.disconnect(); };
  }
  play(kind, volume, force = false) {
    if (kind === 'cancel') return true;
    if (!this.ready) return false;
    if (!force && this.now() - this.lastSound < 1800) return true;
    this.lastSound = this.now(); this.stop();
    const context = this.context, buffer = this.buffers[kind === 'error' ? 'complete' : kind];
    const level = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.35));
    if (buffer) {
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; gain.gain.value = level;
      source.connect(gain); gain.connect(context.destination); this.track(source, gain); source.start();
    } else {
      const pitches = kind === 'wait' ? [660, 440, 660] : kind === 'error' ? [392, 330] : [523.25, 659.25, 783.99];
      pitches.forEach((pitch, i) => {
        const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + i * 0.13;
        oscillator.type = 'sine'; oscillator.frequency.value = pitch;
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(level * 0.15, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
        oscillator.connect(gain); gain.connect(context.destination); this.track(oscillator, gain); oscillator.start(start); oscillator.stop(start + 0.22);
      });
    }
    return true;
  }
  close() { this.closed = true; this.stop(); this.store.close(); if (this.context) void this.context.close().catch(() => {}); }
}
exports.AudioManager = AudioManager;
exports.noticeSoundEnabled = function noticeSoundEnabled(kind, settings, foreground) {
  if (settings.quiet) return false;
  if (kind==='complete'||kind==='error') return settings.completionSound;
  if (kind==='wait') return settings.waitSound;
  if (kind==='health') return settings.healthSound && foreground;
  return false;
};
