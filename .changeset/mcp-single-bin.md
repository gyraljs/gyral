---
'@gyral/mcp': patch
---

Fix `npx -y @gyral/mcp`, broken in 0.3.2 by a second bin: `gyral-mcp http` replaces the
`gyral-mcp-http` bin.
