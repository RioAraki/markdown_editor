[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$RuntimeRoot = $(if ($env:EDITOR_RUNTIME_ROOT) { $env:EDITOR_RUNTIME_ROOT } else { 'D:\markdown_editor_runtime' }),
    [string]$NodePath = (Get-Command node.exe -ErrorAction Stop).Source,
    [string]$TaskName = 'MarkdownEditor Production'
)
$ErrorActionPreference = 'Stop'
$RuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$NodePath = [IO.Path]::GetFullPath($NodePath)
if (!(Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw "Node missing: $NodePath" }
if ($RuntimeRoot.Contains('"') -or $NodePath.Contains('"')) { throw 'Paths cannot contain quotes' }
$controlDir = Join-Path $RuntimeRoot 'control'
$launcher = Join-Path $controlDir 'task-launch.ps1'
# Copy only the stable runtime modules, never editor sources, releases, profiles,
# logs or state. An existing installation is deliberately not upgraded here.
$files = @('config.mjs', 'control.mjs', 'release.mjs', 'backup.mjs', 'smoke.mjs', 'candidate-lifecycle.cjs', 'candidate-watchdog.mjs', 'supervisor.mjs', 'host.mjs', 'task-launch.ps1', 'install-task.ps1')
if (!(Test-Path -LiteralPath $controlDir)) {
    foreach ($file in $files) {
        if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot $file) -PathType Leaf)) { throw "Missing runtime script: $file" }
    }
    if ($PSCmdlet.ShouldProcess($controlDir, 'Install initial stable runtime control scripts')) {
        New-Item -ItemType Directory -Path $controlDir -Force | Out-Null
        foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $controlDir $file) -ErrorAction Stop }
    }
} elseif (!(Test-Path -LiteralPath $launcher -PathType Leaf)) {
    throw 'Existing control directory is incomplete; inspect it before repairing. No files were overwritten.'
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -RuntimeRoot "{1}" -NodePath "{2}"' -f $launcher, $RuntimeRoot, $NodePath
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $RuntimeRoot
$logon = New-ScheduledTaskTrigger -AtLogOn -User $identity
# No repetition duration means indefinite repetition; the periodic trigger also
# recovers a supervisor that exits while the interactive user remains logged on.
$periodic = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
if ($PSCmdlet.ShouldProcess($TaskName, 'Register current-user interactive production supervisor task (does not start it now)')) {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($logon, $periodic) -Settings $settings -Principal $principal -Description 'Release-isolated editor supervisor; interactive logon only.' -Force | Out-Null
}
