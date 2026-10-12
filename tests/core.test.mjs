import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../src/core.mjs').catch(() => ({}));
const { PetState } = module;
function create(options = {}) {
  assert.equal(typeof PetState, 'function', 'PetState must implement Agent runtime accounting');
  return new PetState({ mono: 0, wall: new Date(2026, 9, 11, 12).getTime(), ...options });
}
function advance(state, seconds, start = 0, wall = new Date(2026, 9, 11, 12).getTime()) {
  for (let i = 1; i <= seconds; i++) state.tick(start + i * 1000, wall + i * 1000);
}
test('concurrent Agents count the elapsed union; idle and duplicate state do not add time', () => {
  const s = create(); s.setRunning('a', true); s.setRunning('b', true);
  advance(s, 600); assert.equal(s.snapshot().todayMs, 600000);
  s.setRunning('a', false); advance(s, 300, 600000, s.wall);
  assert.equal(s.snapshot().todayMs, 900000);
  s.setRunning('b', false); advance(s, 300, 900000, s.wall);
  assert.equal(s.snapshot().todayMs, 900000);
});

test('a fresh running edge records the last notice cursor without treating duplicate status as new work',()=>{
  const s=create();s.setRunning('a',true);s.notice('complete','a','done');
  s.setRunning('a',true);assert.equal(s.snapshot().newWorkCursor,0);
  s.setRunning('a',false);s.setRunning('b',true);assert.equal(s.snapshot().newWorkCursor,1);
  s.notice('health',null,'water');s.setRunning('b',true);assert.equal(s.snapshot().newWorkCursor,1);
});
test('two-hour water and rest reminders merge and do not repeat until acknowledged', () => {
  const s = create(); s.setRunning('a', true); advance(s, 7200);
  assert.deepEqual(s.snapshot().due, ['water', 'rest']);
  assert.equal(s.snapshot().notices.filter(n => n.kind === 'health').length, 1);
  advance(s, 30, 7200000, s.wall);
  assert.equal(s.snapshot().notices.filter(n => n.kind === 'health').length, 1);
  s.ack('water'); assert.deepEqual(s.snapshot().due, ['rest']);
  s.snooze('rest'); assert.deepEqual(s.snapshot().due, []);
  advance(s, 600, 7230000, s.wall); assert.deepEqual(s.snapshot().due, ['rest']);
});
test('waiting requests deduplicate, clear on answer, and running wait still counts', () => {
  const s = create(); s.setRunning('a', true);
  s.wait('approval:x', 'a'); s.wait('approval:x', 'a'); advance(s, 5);
  assert.equal(s.snapshot().notices.length, 1); assert.equal(s.snapshot().todayMs, 5000);
  s.resolveWait('approval:x'); assert.equal(s.snapshot().waiting.length, 0);
});
test('midnight splits daily time without clearing reminder progress', () => {
  const wall = new Date(2026, 9, 11, 23, 59, 59, 500).getTime();
  const s = create({ wall }); s.setRunning('a', true); s.tick(1000, wall + 1000);
  assert.equal(s.days['2026-10-11'], 500); assert.equal(s.days['2026-10-12'], 500);
  assert.equal(s.snapshot().todayMs, 500); assert.equal(s.snapshot().waterElapsedMs, 1000);
});
test('sleep gap and backwards wall clock cannot inflate or negate accumulated time', () => {
  const s = create(); s.setRunning('a', true); const wall = s.wall;
  s.tick(1000, wall + 1000); s.tick(600000, wall + 600000);
  assert.equal(s.snapshot().todayMs, 1000);
  s.tick(601000, wall - 100000); assert.equal(s.snapshot().todayMs, 2000);
});
test('restore persists totals and settings without counting application downtime', () => {
  const s = create(); s.setRunning('a', true); advance(s, 5);
  s.configure({ waitSound: false, waterMinutes: 90 });
  const next = create({ saved: s.serialize() }); advance(next, 100);
  assert.equal(next.snapshot().todayMs, 5000); assert.equal(next.snapshot().runningCount, 0);
  assert.equal(next.snapshot().settings.waitSound, false);
});
test('invalid settings and unknown actions leave accepted settings unchanged', () => {
  const s = create(); const before = { ...s.snapshot().settings };
  for (const patch of [{ waterMinutes: 0 }, { volume: 2 }, { waitSound: 'yes' }, { command: 'shell' }]) {
    assert.throws(() => s.configure(patch)); assert.deepEqual(s.snapshot().settings, before);
  }
});
test('legacy settings retain statistics and acquire the ten-minute sleep default', () => {
  const previous = create(); previous.setRunning('a', true); advance(previous, 5);
  previous.configure({ waitSound: false, waterMinutes: 90 });
  const saved = previous.serialize(); delete saved.settings.idleSleepMinutes;
  const next = create({ saved });
  assert.equal(next.snapshot().todayMs, 5000);
  assert.equal(next.snapshot().settings.waitSound, false);
  assert.equal(next.snapshot().settings.waterMinutes, 90);
  assert.equal(next.snapshot().settings.idleSleepMinutes, 10);
  next.configure({ idleSleepMinutes: 15 });
  assert.equal(create({ saved: next.serialize() }).snapshot().settings.idleSleepMinutes, 15);
});
