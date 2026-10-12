import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
test('preview inline controls are valid JavaScript',async()=>{
  const html=await readFile('preview/index.html','utf8');
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new Script(match[1]));
  for(const match of html.matchAll(/onclick="([^"]*)"/g))assert.doesNotThrow(()=>new Script(match[1]));
});
