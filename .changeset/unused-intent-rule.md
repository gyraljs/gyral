---
'@gyral/core': patch
---

New ESLint rule `gyral/unused-intent` (a warning in `gyral.configs.recommended`): an intent
parser that no template in the module names with `data-intent` is reported as a renamed intent or
dead code. It is static, so intents rendered only in some states count as used; components whose
intent names may be used in another module (an imported view, imported template helpers, an
exported `intents()` constant) are skipped.
