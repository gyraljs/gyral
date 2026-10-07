---
'@gyral/core': patch
---

Development warns, once per binding, when a property binding gets a function: on built-in
elements (`.onclick=${fn}`: use `data-intent`) and on Gyral components (props are data and travel
in hydration seeds). Other custom elements, whose API may take a callback, don't warn. The
`gyral/template` ESLint rule also reports a function written directly in any template hole
(`${() => …}`).
