import test from 'node:test';
import assert from 'node:assert/strict';
const { AudioManager, noticeSoundEnabled } = await import('../src/audio.cjs').catch(() => ({}));
function fixture(records = new Map()) {
  assert.equal(typeof AudioManager, 'function', 'custom audio manager must exist');
  let rejectSave = false;
  const played = [], gains = [], stopped = [], gainNodes = [];
  const context = { state: 'suspended', currentTime: 0,
    async resume() { this.state = 'running'; }, async close() { this.state = 'closed'; },
    async decodeAudioData(bytes) { const seconds = new Uint8Array(bytes)[0]; if (!seconds) throw Error('decode'); return { duration: seconds }; },
    createBufferSource() { const source = { connect() {}, disconnect() {}, start() { played.push(this.buffer); }, stop() { stopped.push(this); } }; return source; },
    createGain() { const node = { connect() {}, disconnect() {}, gain: { value: 0, setValueAtTime(v) { gains.push(v); }, linearRampToValueAtTime(v) { gains.push(v); }, exponentialRampToValueAtTime() {} } }; gainNodes.push(node); return node; },
    createOscillator() { return { frequency: {}, connect() {}, disconnect() {}, start() { played.push('tone'); }, stop() {} }; },
  };
  const store = { async get(k) { return records.get(k); }, async put(k, v) { if (rejectSave) throw Error('disk'); records.set(k, v); }, async remove(k) { records.delete(k); }, close() {} };
  return { audio: new AudioManager({ contextFactory: () => context, store, now: () => 10000 }), records, context, played, gains, stopped, gainNodes,
    rejectSave() { rejectSave = true; } };
}
const file = (seconds = 1, name = 'notice.wav', size = 1) => ({ name, size, async arrayBuffer() { return Uint8Array.of(seconds).buffer; } });

test('manual cancellation is silent even when audio is unlocked and all sound switches are enabled', async () => {
  const settings={completionSound:true,waitSound:true,healthSound:true,quiet:false};
  assert.equal(noticeSoundEnabled('cancel',settings,true),false);
  assert.equal(noticeSoundEnabled('error',settings,true),true);
  assert.equal(noticeSoundEnabled('health',settings,false),false);
  assert.equal(noticeSoundEnabled('complete',{...settings,quiet:true},true),false);
  const f=fixture(); await f.audio.unlock(); await f.audio.importClip('complete',file(1));
  assert.equal(f.audio.play('cancel',0.5,true),true);
  assert.equal(f.played.length,0);
  assert.equal(f.audio.play('complete',0.5),true);
  assert.equal(f.played.length,1,'a silent cancellation must not consume the sound cooldown');
});
test('independent clips persist and restore after window reopen', async () => {
  const f = fixture(); await f.audio.unlock();
  await f.audio.importClip('complete', file(2, 'done.wav'));
  await f.audio.importClip('wait', file(3, 'question.wav'));
  assert.equal(f.audio.clips.complete.name, 'done.wav');
  assert.equal(f.audio.clips.wait.name, 'question.wav');
  const reopened = fixture(f.records); await reopened.audio.unlock();
  assert.equal(reopened.audio.clips.complete.name, 'done.wav');
  reopened.audio.play('wait', 0.25, true); assert.equal(reopened.played[0].duration, 3);
});
test('invalid imports preserve previously accepted clip', async () => {
  const f = fixture(); await f.audio.unlock(); await f.audio.importClip('complete', file(1, 'good.wav'));
  for (const bad of [file(1, 'large.wav', 5 * 1024 * 1024 + 1), file(31), file(0), file(1, 'bad.txt'), file(1, 'empty.wav', 0)]) {
    await assert.rejects(f.audio.importClip('complete', bad));
    assert.equal(f.audio.clips.complete.name, 'good.wav');
    assert.equal(f.records.get('complete').name, 'good.wav');
  }
});
test('storage failure does not replace current sound', async () => {
  const f = fixture(); await f.audio.unlock(); await f.audio.importClip('complete', file(1, 'good.wav'));
  f.rejectSave(); await assert.rejects(f.audio.importClip('complete', file(2, 'new.wav')), /保存/);
  assert.equal(f.audio.clips.complete.name, 'good.wav');
});
test('error uses completion clip and volume applies to custom sound', async () => {
  const f = fixture(); await f.audio.unlock(); await f.audio.importClip('complete', file(2));
  assert.equal(f.audio.play('error', 0.2, true), true);
  assert.equal(f.played[0].duration, 2); assert.equal(f.gainNodes[0].gain.value, 0.2);
  f.audio.play('complete', 0.5, true); assert.equal(f.stopped.length, 1);
});
test('reset removes only selected clip and restores built-in sound', async () => {
  const f = fixture(); await f.audio.unlock(); await f.audio.importClip('complete', file()); await f.audio.importClip('wait', file());
  await f.audio.resetClip('complete'); assert.equal(f.records.has('complete'), false); assert.ok(f.records.has('wait'));
  f.audio.play('complete', 0.3, true); assert.ok(f.played.includes('tone'));
});
test('damaged persisted clip falls back with visible warning', async () => {
  const f = fixture(new Map([['complete', { name: 'broken.wav', bytes: Uint8Array.of(0).buffer }]]));
  await f.audio.unlock(); assert.match(f.audio.warning, /恢复/); assert.equal(f.audio.clips.complete, undefined);
  f.audio.play('complete', 0.3, true); assert.ok(f.played.includes('tone'));
});
test('unload releases active source and rejects future playback', async () => {
  const f = fixture(); await f.audio.unlock(); await f.audio.importClip('wait', file()); f.audio.play('wait', 0.3, true);
  f.audio.close(); assert.equal(f.stopped.length, 1); assert.equal(f.context.state, 'closed'); assert.equal(f.audio.play('wait', 0.3, true), false);
});
