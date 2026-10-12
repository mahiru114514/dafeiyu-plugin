import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdir,mkdtemp,writeFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
test('Windows parser never treats PowerShell command or Java application arguments as an entry',{skip:process.platform!=='win32'},async()=>{
  await mkdir('tmp/parser-tests',{recursive:true});const root=await mkdtemp(join(process.cwd(),'tmp/parser-tests/project '));
  const ps=join(root,'server.ps1'),jar=join(root,'server.jar');await writeFile(ps,'');await writeFile(jar,'');
  const runtime=join(root,'runtime.exe'),entry=join(root,'server.cjs'),outside=join(root,'..','other.cjs');
  await copyFile(process.execPath,runtime);await writeFile(entry,'');await writeFile(outside,'');
  const source=await readFile('src/windows-ports.ps1','utf8'),functions=source.split("try {\n  $request")[0];
  const native=source.match(/Add-Type -TypeDefinition @'\n([\s\S]*?)\n'@/)[1];
  const cases=[
    {name:'powershell.exe',command:`powershell.exe -NoProfile -File "${ps}"`,match:true},
    {name:'powershell.exe',command:`powershell.exe -Command echo -File "${ps}"`,match:false},
    {name:'java.exe',command:`java.exe -Xmx256m -jar "${jar}"`,match:true},
    {name:'java.exe',command:`java.exe com.example.Server -jar "${jar}"`,match:false},
    {name:'runtime.exe',executable:runtime,command:`"${runtime}" "${outside}"`,match:false},
    {name:'runtime.exe',executable:runtime,command:`"${runtime}" "${entry}"`,match:true},
  ];
  const code=functions+`\nAdd-Type -TypeDefinition @'\n${native}\n'@\n$cases=$env:HP_PARSER_CASES|ConvertFrom-Json\n$results=@($cases|ForEach-Object { [bool](ProjectEvidence @{Name=$_.name;CommandLine=$_.command;ExecutablePath=$(if($_.executable){$_.executable}else{'C:\\runtime.exe'})} $env:HP_PARSER_ROOT) })\nConvertTo-Json -InputObject $results -Compress`;
  const output=await new Promise((resolve,reject)=>{
    const child=spawn(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{windowsHide:true,env:{...process.env,HP_PARSER_CASES:JSON.stringify(cases),HP_PARSER_ROOT:root}});
    let result='',error='';child.stdout.setEncoding('utf8');child.stdout.on('data',s=>result+=s);child.stderr.setEncoding('utf8');child.stderr.on('data',s=>error+=s);
    child.on('error',reject);child.on('close',code=>code?reject(Error(error)):resolve(result));
  });
  assert.deepEqual(JSON.parse(output.replace(/^\uFEFF/,'')),cases.map(c=>c.match));
});
