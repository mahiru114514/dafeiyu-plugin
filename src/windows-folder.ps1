$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try {
  $directory=$env:DSH_PET_FOLDER
  if(-not [IO.Path]::IsPathRooted($directory) -or -not (Test-Path -LiteralPath $directory -PathType Container)){throw 'Directory unavailable'}
  # ShellExecute opens a directory as data; no command string or Explorer switch parsing.
  $info=[Diagnostics.ProcessStartInfo]::new()
  $info.FileName=$directory
  $info.UseShellExecute=$true
  $info.Verb='open'
  $child=[Diagnostics.Process]::Start($info)
  if($child){$child.Dispose()}
  @{opened=$true}|ConvertTo-Json -Compress
} catch {
  @{error='无法打开文件资源管理器。'}|ConvertTo-Json -Compress
  exit 1
}
