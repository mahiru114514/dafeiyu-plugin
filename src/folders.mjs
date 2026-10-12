import {readFile,stat,realpath} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join,win32} from 'node:path';
const exec=promisify(execFile);let script;
async function launchFolder(folderPath,signal) {
  script??=readFile(new URL('./windows-folder.ps1',import.meta.url),'utf8');
  const executable=join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  try {
    const {stdout}=await exec(executable,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(await script,'utf16le').toString('base64')],{
      windowsHide:true,timeout:10000,maxBuffer:8192,signal,env:{...process.env,DSH_PET_FOLDER:folderPath}});
    if(JSON.parse(stdout.replace(/^\uFEFF/,'')).opened!==true)throw Error();
  } catch {throw Error(signal.aborted?'插件已停用。':'无法打开文件夹，请确认文件资源管理器可用后重试。');}
}
export function createFolderOpener({platform=process.platform,launch=launchFolder}={}) {
  const supported=platform==='win32',controllers=new Set();let disposed=false;
  function assertOpen(){if(disposed)throw Error('插件已停用。');if(!supported)throw Error('打开文件夹目前仅支持 Windows。');}
  async function open(path) {
    assertOpen();
    if(typeof path!=='string'||!win32.isAbsolute(path)||['\\','/'].includes(win32.parse(path).root)||path.includes('\0'))throw Error('无法确认工作区的完整目录。');
    let folderPath;
    try {if(!(await stat(path)).isDirectory())throw Error();folderPath=await realpath(path);}catch{throw Error('工作区文件夹不存在、不可访问或不是目录。');}
    assertOpen();const controller=new AbortController();controllers.add(controller);
    try {await launch(folderPath,controller.signal);assertOpen();return{folderPath};}
    finally {controllers.delete(controller);}
  }
  function dispose(){disposed=true;for(const controller of controllers)controller.abort();controllers.clear();}
  return{supported,open,dispose};
}
