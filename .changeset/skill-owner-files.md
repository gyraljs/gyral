---
'@gyral/mcp': patch
---

`gyral-mcp skill` keeps the files an owner puts beside a vendored or user-level copy of the skill
(gyral-337.18). Before, it removed them, and `--check` failed on them. Kept and never compared, at
the top of each folder: `LICENSE` (or `LICENCE`), `NOTICE`, `COPYING`, `PINNED` and `SOURCE` (or
`SOURCES`), each with any extension or suffix (`NOTICE.txt`, `PINNED.txt`, `SOURCE-gyral.md`).
Any other file the skill doesn't ship is still removed.

Each copy also gets a `VERSION` file naming its release and the source it came from
(`https://github.com/gyraljs/gyral/tree/v<version>/skills/gyral`), which `--check` compares like
the skill's other files, so a pin note is no longer needed. The first `skill` run after
upgrading writes it, and `--check` fails until then.
