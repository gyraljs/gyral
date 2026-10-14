---
'@gyral/ssr': patch
---

Removed the empty `@gyral/ssr/hydrate` entry point. It exported nothing and was kept only so 0.2's `import '@gyral/ssr/hydrate'` still resolved; hydration is built into `@gyral/core`. Delete that import if an app still has it.
