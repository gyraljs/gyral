---
'@gyral/core': patch
---

`?modal=${open}` on a `<dialog>` opens it with `showModal()` and closes it with `close()` as the
state changes, and `?popover-open=${open}` does the same for a `[popover]` element with
`showPopover()`/`hidePopover()`. The browser returns focus to the opener; name `close` in
`data-intent-on` so a dialog closed with Escape updates the model. Neither binding writes server
HTML: hydration opens what the model says. Builds with the preset bundle the code only when a
module uses either binding.

Behavior change: `modal` or `popover-open` bound any other way (without `?`, or on the wrong
element) is now template rule 4.
