---
'@gyral/testing': patch
---

New `outputsIn(commands, Component)` and `focusTargetsIn(commands)`: model tests read what a
reducer sent to its parent (`emit`, `outputs<O>()`), typed by the component's output union
(`outputsIn<Out>(commands)` names the union instead), and where it asked focus to go
(`{ selector, preventScroll?, select? }`), without filtering on core's internal driver names
(`'@gyral/emit'`, `'@gyral/focus'`), which may change.
