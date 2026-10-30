---
'@gyral/core': patch
---

`ctx.props` is now the same object while no declared prop's value changes, and a new one when
one does (gyral-bn7). It was a new object on every read, so an `each()` pick that captured it,
such as `(day) => ({ day, props })`, never equalled the last one: every row re-rendered on
every render, and development warned G0017 about pure views. If your code mutated `ctx.props`,
copy it first. Components with props bundle about 30 B (gzip) more.

G0017's development message now says where the view differs: in its template, or in the
innermost `each(…, Row)` or `keyed(…)` that does. When that list's pick returned a new object
for the same item, it says to pick the fields the row reads or to pass
`each(items, key, row, { pick, equals })`.
