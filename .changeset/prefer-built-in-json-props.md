---
'@gyral/core': patch
---

`gyral/prefer-built-in` now warns about `JSON.parse` of a prop whatever the props parameter is
called, and when it is destructured (gyral-bt4): `init: (p) => ({ a: JSON.parse(p.a) })`,
`init: ({ items }) => …JSON.parse(items)…` and `view: (s, i, { props: { items } }) => …` warn
as `init: (props) => …JSON.parse(props.a)…` already did. The rule finds the props by their
position in the spec's functions: `init`'s first parameter, `subscriptions`' second, and the
context of `view`, the reducers, intent parsers (`on()`'s too) and `formAssociated`. Linting may
show new warnings where a component parses a prop by hand: declare it as `prop.json(schema)`,
and Gyral parses and validates the attribute for you.
