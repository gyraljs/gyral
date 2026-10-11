---
'@gyral/core': patch
---

Apply native modal and popover bindings after their DOM is inserted and child components
have rendered. Conditional dialogs, keyed replacements and initially open components no
longer call showModal on detached elements; post-render focus commands run after opening.
The same ordering applies to hydration and compiled builds.

Continue the scheduler flush when native focus events or other post-commit client calls
dispatch intents. Their new DOM is rendered before any resulting focus commands, and
settled waits for that work to finish.
