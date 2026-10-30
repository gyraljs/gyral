---
'@gyral/mcp': patch
---

`gyral-mcp skill --dir <folder>` writes an absolute folder where it points (gyral-vbm). Before,
`--dir ~/.claude/skills/gyral` was joined onto the app's folder, so a user-level copy landed in a
nested folder inside the project instead. Folders inside the app print relative to it; others
print in full.
