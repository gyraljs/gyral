---
'@gyral/core': patch
---

`formValues(definition, formData)` returns a form's submitted text values keyed by its fields
(the same shape as `IntentRejected.values`), for a server route that validates on its own and
re-renders the form with what was typed. It replaces `formFields(formDataToObject(…))`, which
moved to `@gyral/core/internal` in this release.
