$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Connections([int]$port) {
  # Query Listening first: an unoccupied requested port is a valid empty result.
  return @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq $port })
}
function ProtectedIds([int]$hostId) {
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  $currentId = $hostId
  for ($i=0; $i -lt 64 -and $currentId -gt 0; $i++) {
    if (-not $ids.Add($currentId)) { break }
    $record = Get-CimInstance Win32_Process -Filter "ProcessId=$currentId" -Property ProcessId,ParentProcessId -ErrorAction Stop
    if (-not $record) { break }
    $currentId = [int]$record.ParentProcessId
  }
  return ,$ids
}
function Target([int]$processId, $protected, [string]$userSid) {
  $process = $null
  try {
    $process = [System.Diagnostics.Process]::GetProcessById($processId)
    $null = $process.Handle # Bind all later operations to this exact process object.
    $started = $process.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture)
    $record = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -Property ProcessId,Name,ExecutablePath,CommandLine -ErrorAction Stop
    if (-not $record) { throw '进程已退出，请重新检查。' }
    $name = [string]$record.Name
    $owner = Invoke-CimMethod -InputObject $record -MethodName GetOwnerSid -ErrorAction Stop
    $blocked = ''
    if ($processId -le 4 -or $protected.Contains($processId)) { $blocked='Harness 或宿主进程受到保护。' }
    elseif ($name -match '^(System|Registry|svchost|lsass|services|wininit|csrss|smss|winlogon|dwm|explorer|sihost|taskhostw|fontdrvhost)(\.exe)?$' -or $name -match '(?i)deepseek[\s_-]*harness|^dsh(\.exe)?$|^codex(\.exe)?$') { $blocked='应用或系统关键进程受到保护。' }
    elseif ($owner.ReturnValue -ne 0 -or $owner.Sid -ne $userSid) { $blocked='不能结束其他用户或身份不可确认的进程。' }
    elseif (-not $record.ExecutablePath) { $blocked='无法确认程序路径，不能结束此进程。' }
    return @{process=$process;record=$record;info=@{pid=$processId;name=$name;path=[string]$record.ExecutablePath;startedAt=$started;canTerminate=($blocked -eq '');blockedReason=$blocked}}
  } catch {
    if ($process) { $process.Dispose() }
    return @{process=$null;info=@{pid=$processId;name='无法读取';path='';startedAt='';canTerminate=$false;blockedReason='进程已退出、权限不足或身份无法确认。'}}
  }
}
function ProjectPath([string]$value) {
  if (-not [IO.Path]::IsPathRooted($value) -or -not (Test-Path -LiteralPath $value -PathType Container)) { throw '当前项目目录不存在或不可访问。' }
  $full = [IO.Path]::GetFullPath($value).TrimEnd([char[]]'\/')
  if ($full -eq [IO.Path]::GetPathRoot($full).TrimEnd([char[]]'\/')) { throw '不能扫描磁盘根目录。' }
  return $full
}
function InsideProject([string]$value,[string]$root) {
  if (-not $value -or -not [IO.Path]::IsPathRooted($value)) { return $false }
  try {
    $full=[IO.Path]::GetFullPath($value)
    return $full.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $full -PathType Leaf)
  } catch { return $false }
}
function ProjectEvidence($record,[string]$root) {
  $program=([string]$record.Name).ToLowerInvariant()
  $runtimePattern='^(node|python(?:\d+(?:\.\d+)?)?|pythonw|dotnet|powershell|pwsh|javaw?)\.exe$'
  $runtime=$program -match $runtimePattern
  if(-not $runtime -and (InsideProject ([string]$record.ExecutablePath) $root)){
    try {
      $original=[IO.Path]::GetFileName([Diagnostics.FileVersionInfo]::GetVersionInfo([string]$record.ExecutablePath).OriginalFilename).ToLowerInvariant()
      if($original -match $runtimePattern){$program=$original;$runtime=$true}
    } catch { return '' }
  }
  # Shared runtimes can live in A while executing B: their binary location is not project evidence.
  if (-not $runtime) { if (InsideProject ([string]$record.ExecutablePath) $root) { return '程序位于当前项目内' };return '' }
  if (-not $record.CommandLine) { return '' }
  $argv=[HarnessPetCommandLine]::Split([string]$record.CommandLine)
  $entry=''
  if ($program -match '^(node|python(?:\d+(?:\.\d+)?)?|pythonw|dotnet)\.exe$') {
    for ($i=1;$i -lt $argv.Length;$i++) {
      $arg=$argv[$i]
      # Only a runtime's entry argument qualifies; eval, modules, preloads and arbitrary flags never do.
      if ($arg -eq '--') { if($i+1 -lt $argv.Length){$entry=$argv[$i+1]};break }
      if ($program -eq 'node.exe' -and $arg -match '^(-r|--require|--import|--loader)$') { $i++;continue }
      if ($program -eq 'node.exe' -and $arg -match '^--(inspect(?:-brk)?(?:=.*)?|no-warnings|trace-warnings|enable-source-maps|require=.*|import=.*|loader=.*)$') { continue }
      if ($program -match '^python' -and $arg -match '^-(u|B|O|OO)$') { continue }
      if ($arg.StartsWith('-')) { return '' }
      $entry=$arg;break
    }
    if ($program -eq 'node.exe' -and $entry -notmatch '\.(cjs|mjs|js|ts)$') { return '' }
    if ($program -match '^python' -and $entry -notmatch '\.py$') { return '' }
    if ($program -eq 'dotnet.exe' -and $entry -notmatch '\.dll$') { return '' }
  } elseif ($program -match '^(powershell|pwsh)\.exe$') {
    for($i=1;$i -lt $argv.Length;$i++){
      $arg=$argv[$i].ToLowerInvariant()
      if($arg -eq '-file'){if($i+1 -lt $argv.Length){$entry=$argv[$i+1]};break}
      if($arg -in @('-nologo','-noprofile','-noninteractive','-noexit','-sta','-mta')){continue}
      if($arg -in @('-executionpolicy','-windowstyle','-inputformat','-outputformat')){$i++;continue}
      return '' # Command/EncodedCommand, abbreviations and unknown modes are not file evidence.
    }
    if($entry -notmatch '\.ps1$'){return ''}
  } elseif ($program -match '^javaw?\.exe$') {
    for($i=1;$i -lt $argv.Length;$i++){
      $arg=$argv[$i]
      if($arg -eq '-jar'){if($i+1 -lt $argv.Length){$entry=$argv[$i+1]};break}
      if($arg -match '^(-D.+|-X.+|-ea|-da|--enable-preview)$'){continue}
      if($arg -in @('-cp','-classpath','--class-path','-p','--module-path','--add-opens','--add-exports')){$i++;continue}
      return '' # A main class/module or unknown flag ends the accepted launcher grammar.
    }
    if($entry -notmatch '\.jar$'){return ''}
  }
  if(InsideProject $entry $root){return '启动脚本位于当前项目内'}
  return ''
}
try {
  $request = $env:DSH_PET_PORT_REQUEST | ConvertFrom-Json
  $projectMode=$request.mode -eq 'scan-project' -or $request.mode -eq 'terminate-project'
  if ($request.hostPid -isnot [int] -or $request.hostPid -le 0) { throw '端口请求格式不正确。' }
  if ($request.mode -notin @('inspect','terminate','scan-project','terminate-project')) { throw '不支持此端口操作。' }
  if($request.mode -ne 'scan-project' -and ($request.port -isnot [int] -or $request.port -lt 1 -or $request.port -gt 65535)){throw '端口请求格式不正确。'}
  if($projectMode){
    $root=ProjectPath ([string]$request.projectPath)
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class HarnessPetCommandLine {
  [DllImport("shell32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern IntPtr CommandLineToArgvW(string text, out int count);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr pointer);
  public static string[] Split(string text) {
    int count; IntPtr block=CommandLineToArgvW(text,out count);
    if(block==IntPtr.Zero)return new string[0];
    try { var result=new string[count]; for(int i=0;i<count;i++)result[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(block,i*IntPtr.Size)); return result; }
    finally { LocalFree(block); }
  }
}
'@
  }
  $protected = ProtectedIds $request.hostPid
  $userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $connections = if($request.mode -eq 'scan-project'){@(Get-NetTCPConnection -State Listen -ErrorAction Stop)}else{Connections $request.port}
  if ($request.mode -eq 'inspect' -or $request.mode -eq 'scan-project') {
    $owners = @()
    foreach ($group in @($connections | Group-Object OwningProcess)) {
      $target = Target ([int]$group.Name) $protected $userSid
      try {
        if($projectMode){$evidence=ProjectEvidence $target.record $root;if(-not $evidence){continue};$target.info.evidence=$evidence}
        $target.info.addresses = @($group.Group.LocalAddress | Sort-Object -Unique)
        $target.info.ports = @($group.Group.LocalPort | Sort-Object -Unique)
        $owners += $target.info
      }
      finally { if ($target.process) { $target.process.Dispose() } }
    }
    @{owners=@($owners)} | ConvertTo-Json -Depth 5 -Compress
  } else {
    if ($request.pid -isnot [int] -or $request.pid -le 4 -or $request.startedAt -isnot [string] -or $request.startedAt -notmatch '^\d{15,20}$') { throw '进程请求格式不正确。' }
    if (-not @($connections | Where-Object { $_.OwningProcess -eq $request.pid }).Count) { throw '进程不再占用此端口，请重新检查。' }
    $target = Target $request.pid $protected $userSid
    try {
      if (-not $target.process -or -not $target.info.canTerminate) { throw '此进程受到保护或身份无法确认，不能结束。' }
      if ($target.info.startedAt -ne $request.startedAt) { throw '进程已改变，请重新检查端口。' }
      if ($projectMode -and -not (ProjectEvidence $target.record $root)) { throw '进程不再属于当前项目，不能结束。' }
      # Recheck binding after CIM ownership checks; Kill uses the held handle, never a fresh PID lookup.
      if (-not @(Connections $request.port | Where-Object { $_.OwningProcess -eq $request.pid }).Count) { throw '端口占用已改变，请重新检查。' }
      $target.process.Kill()
      if (-not $target.process.WaitForExit(5000)) { throw '进程仍在退出，请稍后重新检查端口。' }
      @{terminated=$true} | ConvertTo-Json -Compress
    } finally { if ($target.process) { $target.process.Dispose() } }
  }
} catch {
  @{error='端口操作失败：'+$_.Exception.Message} | ConvertTo-Json -Compress
  exit 1
}
