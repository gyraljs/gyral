---
'@gyral/mcp': patch
---

`gyral-mcp skill` (gyral-337.4): `npx @gyral/mcp@<version> skill`, in an app with that
`@gyral/core` version installed, writes the Gyral skill it bundles to `.claude/skills/gyral`,
and to `.agents/skills/gyral` when that folder exists (`--dir` names others), removing files the
skill no longer has. `--check` writes nothing and exits 1 when a copy differs, for CI. It
replaces hand-copied skills pinned by hash.
