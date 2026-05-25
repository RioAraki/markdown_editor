#requires -version 5
<#
.SYNOPSIS
  Auto-commit and push any uncommitted changes in the repo.

.DESCRIPTION
  Intended to run from Windows Task Scheduler on an hourly trigger.
  Safe-by-default: skips when a merge/rebase is in progress, when there
  are no changes, and logs every run to scripts/auto-commit.log so you
  can audit what happened.

.PARAMETER RepoPath
  Path to the git repo. Defaults to this script's parent folder.

.NOTES
  - Uses `git add -A` so untracked files are included. Keep .gitignore
    tight to avoid committing secrets (.env, credentials, etc.).
  - `git push` requires cached credentials (Git Credential Manager
    handles this once you've successfully pushed manually).
  - If the remote has new commits, push fails harmlessly; we never
    auto-pull/rebase.
#>

param(
  [string]$RepoPath = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Continue'

$logFile = Join-Path $RepoPath 'scripts\auto-commit.log'
$ts      = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

function Log([string]$msg) {
  $line = "$ts  $msg"
  $line | Out-File -FilePath $logFile -Append -Encoding utf8
}

try {
  if (-not (Test-Path $RepoPath)) { Log "ERROR: repo not found at $RepoPath"; exit 1 }
  Set-Location $RepoPath

  # Bail out cleanly during in-progress git operations
  if (Test-Path '.git\MERGE_HEAD')   { Log 'skip: merge in progress'; exit 0 }
  if (Test-Path '.git\rebase-merge') { Log 'skip: rebase in progress'; exit 0 }
  if (Test-Path '.git\rebase-apply') { Log 'skip: rebase in progress'; exit 0 }

  $status = git status --porcelain
  if (-not $status) { Log 'no changes'; exit 0 }

  $changedCount = ($status -split "`n").Count
  Log "staging $changedCount change(s)"

  git add -A | Out-Null

  $commitOutput = git commit -m "auto-commit $ts" 2>&1
  Log ("commit: " + (($commitOutput | Out-String).Trim() -replace "`r?`n", ' | '))

  $pushOutput = git push 2>&1
  Log ("push:   " + (($pushOutput | Out-String).Trim() -replace "`r?`n", ' | '))
}
catch {
  Log "ERROR: $_"
  exit 1
}
