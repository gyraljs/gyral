---
'@gyral/core': patch
'@gyral/ssr': patch
---

A form definition validates and re-fills on its own: `definition.validate(formData, intent?)` is
the validation `form()` and `formAction` run, and `definition.values(formData)` returns the
submitted text values keyed by the form's fields (the same shape as `IntentRejected.values`), for
a server route that validates on its own and re-renders the form with what was typed. They
replace `formFields(formDataToObject(…))`, which are no longer exported.

Behavior change: `validateForm(definition, intent, data)` is removed; use
`definition.validate(data, intent)`.
