import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { Context } from '@deepseek-ai/cordis';
import { createHost,inject as hostInject } from '../src/index.mjs';

test('real Cordis loads event listeners, waterfall delegation and disposes host', async () => {
  const ctx = new Context(), routes = new Map();
  const a = { id: 'integration-root', status: 'idle', session: { id: 'integration-root' } };
  ctx.reflect.provide('agents', { list: () => [a], roots: () => [a] });
  ctx.reflect.provide('sessions', {});
  ctx.reflect.provide('workspaceRegistry',{list:()=>[]});
  ctx.reflect.provide('connection', { fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } } });
  await mkdir('tmp/tests', { recursive: true });
  const folder = await mkdtemp(join(process.cwd(), 'tmp/tests/integration-'));
  let host, mono = 0;
  const fiber = ctx.plugin({ name: 'pet-integration', inject: hostInject,
    async apply(child) { host = await createHost(child, { stateFile: join(folder, 'state.json'), timer: false, clock: () => [mono, Date.now()] }); } });
  await fiber.await(); assert.equal(fiber.state, 2); assert.equal(routes.size, 2);
  await ctx.serial('agent/status', { agent: a, status: 'running' });
  mono += 1000; host.tick(); assert.equal(host.snapshot().todayMs, 1000);
  const result = await ctx.waterfall('user-questions/request', { agent: a, wait: { callId: 'actual-waterfall' } }, async () => ({ answer: 'unchanged' }));
  assert.deepEqual(result, { answer: 'unchanged' }); assert.equal(host.snapshot().waiting.length, 0);
  await fiber.dispose(); assert.equal(routes.size, 0);
  const before = host.snapshot().runningCount;
  await ctx.serial('agent/status', { agent: a, status: 'idle' });
  assert.equal(host.snapshot().runningCount, before);
  assert.equal(JSON.parse(await readFile(join(folder, 'state.json'))).version, 1);
});

test('built client registers Harness factory, scoped style and removable overlay', async () => {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(manifest.dsh.client.immediately, true);
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh'], '0.2.0-rc.2');
  assert.match(await readFile('cordis.patch.yml', 'utf8'), /name: dsh-harness-pet/);
  assert.ok(manifest.files.includes('cordis.patch.yml'));
  let entry, styled = false, removed = false, registered;
  const scope = { window: { __ModuleLoader__: { load(value) { entry = value; } } },
    document: { createElement: () => ({ remove() { removed = true; } }), head: { append(style) { styled = style.textContent.includes('.harness-pet'); } } } };
  runInNewContext(await readFile('lib/client.js', 'utf8'), scope);
  assert.equal(entry.id, 'dsh-harness-pet');
  const client = entry.factory(id => { assert.equal(id, 'react'); return React; });
  assert.equal(typeof client.Pet, 'function'); assert.deepEqual(Array.from(client.inject), ['slots', 'uiWorkspace', 'sessions']);
  let cleanup;
  client.apply({ effect(fn) { cleanup = fn(); }, slots: { inject(name, cb) { assert.equal(name, 'shell.overlay'); cb(); }, register(slot, component) { registered = { slot, component }; } } });
  assert.ok(styled); assert.equal(registered.slot.id, 'harness-pet');
  assert.equal(registered.component().type, client.Pet);
  cleanup(); assert.ok(removed);
});
