---
'@gyral/core': patch
'@gyral/testing': patch
---

`focus(selector, { wait: true })` focuses a target that appears only in a later render, such
as the first result after a search. The request stays pending until a render of the component
produces the target; a newer `focus()` from the component replaces it, and after one second it
gives up with the usual warning. `settled()` doesn't wait for it. `focusTargetsIn()` reports
`wait`.
