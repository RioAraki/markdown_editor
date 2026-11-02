#!/usr/bin/env node
// Mirrors CLAUDE.md into AGENTS.md so both agent instruction files stay in sync.
//
// CLAUDE.md is the source of truth; AGENTS.md is generated. Run with --check to
// verify instead of write (exit 1 when out of sync), or --install-git-hook to
// (re)install the pre-commit hook that keeps committed state in sync.
//
// Paths resolve from this file's location, so the cwd does not matter.

import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(repoRoot, "CLAUDE.md");
const target = join(repoRoot, "AGENTS.md");

const BANNER =
  "<!-- Generated from CLAUDE.md by scripts/sync-agent-docs.mjs. Edit CLAUDE.md, not this file. -->";

const GIT_HOOK = `#!/bin/sh
# Keep AGENTS.md in sync with CLAUDE.md on every commit.
node "$(git rev-parse --show-toplevel)/scripts/sync-agent-docs.mjs" || exit 1
git add -- AGENTS.md
`;

function render() {
  return `${BANNER}\n\n${readFileSync(source, "utf8").replace(/^﻿/, "")}`;
}

function current() {
  try {
    return readFileSync(target, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function installGitHook() {
  const hooksDir = join(repoRoot, ".git", "hooks");
  const hookPath = join(hooksDir, "pre-commit");
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(hookPath, GIT_HOOK, "utf8");
  try {
    chmodSync(hookPath, 0o755);
  } catch {
    // Windows filesystems without POSIX modes: git runs the hook via sh anyway.
  }
  console.log(`installed ${hookPath}`);
}

const args = process.argv.slice(2);

if (args.includes("--install-git-hook")) {
  installGitHook();
  process.exit(0);
}

const wanted = render();
const found = current();

if (found === wanted) process.exit(0);

if (args.includes("--check")) {
  console.error(
    found === null
      ? "AGENTS.md is missing. Run: node scripts/sync-agent-docs.mjs"
      : "AGENTS.md is out of sync with CLAUDE.md. Run: node scripts/sync-agent-docs.mjs",
  );
  process.exit(1);
}

writeFileSync(target, wanted, "utf8");
console.log("AGENTS.md synced from CLAUDE.md");
