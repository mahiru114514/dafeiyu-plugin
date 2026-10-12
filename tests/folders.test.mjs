import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const {createFolderOpener}=await import('../src/folders.mjs').catch(()=>({}));
test('folder opener accepts existing directories with spaces and commas, never files or arbitrary commands',async()=>{
  assert.equal(typeof createFolderOpener,'function');await mkdir('tmp/folder-tests',{recursive:true});
  const root=await mkdtemp(join(process.cwd(),'tmp/folder-tests/folder , ')),calls=[];
  const opener=createFolderOpener({platform:'win32',launch:async path=>calls.push(path)});
  const result=await opener.open(root);assert.equal(result.folderPath,root);assert.deepEqual(calls,[root]);
  const file=join(root,'test.txt');await writeFile(file,'example');
  for(const path of [file,join(root,'missing'),'https://example.com','relative','\\relative',null])await assert.rejects(opener.open(path));
  assert.equal(calls.length,1);opener.dispose();await assert.rejects(opener.open(root),/停用/);
});
test('unsupported platforms cannot launch folders',async()=>{
  assert.equal(typeof createFolderOpener,'function');const opener=createFolderOpener({platform:'linux',launch:()=>assert.fail('unexpected launch')});
  assert.equal(opener.supported,false);await assert.rejects(opener.open('E:\\project'),/Windows/);
});
