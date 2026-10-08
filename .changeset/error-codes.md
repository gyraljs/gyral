---
'@gyral/core': patch
---

Production builds print short diagnostics: `Gyral G0010 my-cart Add https://gyral.dev/errors/#G0010`
(the code, the message's arguments, a docs link) instead of the full text, which development
builds keep unchanged. The codes and texts live in one table (`packages/core/src/view/messages.ts`),
from which `docs/references/errors.md` and `errors.json` are generated for the gyral.dev errors
page; `pnpm invariants` checks that codes are unique, that every production message names a code
in the table with matching arguments, and that the docs are current. A hydration mismatch keeps
its sentence in production and ends with its code and link. Apps ship 0.16–0.40 KiB gzip less.

Behavior change: production builds print `Gyral G00NN …` codes instead of the message text; match on the code (or use a development build) if you assert on error text.
