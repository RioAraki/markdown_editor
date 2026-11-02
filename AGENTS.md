<!-- Generated from CLAUDE.md by scripts/sync-agent-docs.mjs. Edit CLAUDE.md, not this file. -->

# markdown-diary-editor

## Agent instruction files

`CLAUDE.md` is the source of truth. `AGENTS.md` is generated from it by `scripts/sync-agent-docs.mjs`, so edit `CLAUDE.md` and never `AGENTS.md`. A `PostToolUse` hook in `.claude/settings.json` regenerates `AGENTS.md` after an agent edits any file; after editing `CLAUDE.md` by hand, run `node scripts/sync-agent-docs.mjs` yourself. `node scripts/sync-agent-docs.mjs --check` verifies the two match, and `--install-git-hook` adds a pre-commit hook that also covers hand edits (not installed by default, since git hooks live outside version control).

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in `RioAraki/markdown_editor`, driven through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles map one-to-one onto identically named GitHub labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and one `docs/adr/` at the repo root, both created lazily. See `docs/agents/domain.md`.
