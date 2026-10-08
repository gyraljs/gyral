---
'@gyral/router': patch
---

`match()` now returns the canonical path with the match: `{ name, params, path }`, where `path`
is `href(name, params)`. A server redirects to it when the request's pathname differs (a
trailing slash, lowercase percent-escapes), so each page answers at one URL (recipe in ADR 0009
"Canonical paths" and the skill's ssr.md). Tests that compare a whole match with `toEqual` need
the new field.

Fixes: the fallback matcher (no URLPattern) skipped empty segments, so `/users//7` matched
`/users/:id` there but not under URLPattern; empty segments now never match in either. A string
starting with `//` is read as a path, not a host. Patterns the two matchers would read
differently throw (`/v:id`, `:post-id`, empty or dot segments, a param named twice, `#`), and
literal segments are stored as URLs spell them (`/café` → `/caf%C3%A9`). A generated set of
about 56,000 paths checks both matchers agree, in Chromium and in Node.
