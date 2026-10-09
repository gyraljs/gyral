---
'@gyral/core': patch
---

A child's output now reaches only its direct parent: it fires the intent on the child's host and
stops there once that parser takes it, so a grandparent never reads a grandchild's output as its
child's. Content slotted into a shadow-DOM child (forms, controls, child components) belongs to
the outer component: its intents fire there, a slotted `<form data-intent>` gets its `FormData`
and its native submit cancelled, and a slotted child's outputs reach `child()`.

Behavior change: output events stop at the Gyral parent that takes them (page listeners above it
no longer see them), and intents inside slotted content now fire for the outer component.
