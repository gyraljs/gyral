---
'@gyral/core': patch
---

G0017 no longer warns about pure views that build their values anew each render (gyral-nyy).
The development recheck of a skipped view now compares what the view renders, not object
identities: `each(s.items.map(…), …)`, `keyed(key, html…)`, `.data=${{ n: s.n }}` and
`.items=${s.items.slice()}` match what they rendered before. An `each` row whose item or pick
changed is rendered again and compared; plain objects and arrays compare by value (deeply,
bounded). A `Date`, `Set` or class instance built in the view still compares by reference, and
a view that reads `Date.now()`, a module variable or the DOM still warns. Development only:
production builds are unchanged.
