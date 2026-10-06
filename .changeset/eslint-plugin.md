---
'@gyral/core': minor
---

`@gyral/core/eslint`: an ESLint flat-config plugin (`gyral.configs.recommended`). `gyral/template`
reports the template rules (docs/design-docs/view/09-template-rules.md) in the editor, with the
compiler's and the development runtime's own messages, at the tag, text or `${…}` they are
about; `gyral/each-row-purity` reports `each` rows that read the view's scope and `each` calls
without a key function (view/03-lists.md). ESLint 9 or 10 is an optional peer dependency.
