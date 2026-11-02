# markdown-diary-editor

## Agent instruction files

`CLAUDE.md` is the source of truth. `AGENTS.md` is generated from it by `scripts/sync-agent-docs.mjs`, so edit `CLAUDE.md` and never `AGENTS.md`. Two hooks keep them in sync: a `PostToolUse` hook in `.claude/settings.json` regenerates `AGENTS.md` after an agent edits any file, and a `pre-commit` hook regenerates and stages it on every commit, which also covers hand edits. Git hooks live outside version control, so run `node scripts/sync-agent-docs.mjs --install-git-hook` once per clone. `node scripts/sync-agent-docs.mjs --check` verifies the two match.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in `RioAraki/markdown_editor`, driven through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles map one-to-one onto identically named GitHub labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and one `docs/adr/` at the repo root, both created lazily. See `docs/agents/domain.md`.
