param(
    [string]$RuntimeRoot = $(if ($env:EDITOR_RUNTIME_ROOT) { $env:EDITOR_RUNTIME_ROOT } else { 'D:\markdown_editor_runtime' }),
    [Parameter(Mandatory = $true)][string]$NodePath
)
$ErrorActionPreference = 'Stop'
$env:EDITOR_RUNTIME_ROOT = [IO.Path]::GetFullPath($RuntimeRoot)
$supervisor = Join-Path $env:EDITOR_RUNTIME_ROOT 'control\supervisor.mjs'
if (!(Test-Path -LiteralPath $supervisor -PathType Leaf)) { throw "Supervisor missing: $supervisor" }
if (!(Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw "Node missing: $NodePath" }
# Synchronous invocation is intentional: Task Scheduler owns this wrapper for
# the entire supervisor lifetime. Do not use a detached Start-Process here.
& $NodePath $supervisor
exit $LASTEXITCODE
