---
'@gyral/core': patch
---

Per-event intent attributes: `data-intent-<event>=${i.Msg}` names the intent for one event type,
so one element can send different messages for different events
(`data-intent-pointerdown=${i.Grab} data-intent-keydown=${i.Key}`) without wrapper elements. For
an event of type T, an element's `data-intent-T` comes before its plain `data-intent`; lookup
still starts at the element that was hit. The component listens for the event types in these
attribute names (bound or static, also in `raw()` markup). `data-intent-on` stays the trigger
list. The client-only scan counts `data-intent-command`, and `gyral/unused-intent` counts
per-event values as uses. `IntentInput.newState` is now read from any event that carries it
(`toggle`, and `beforetoggle` too).

Behavior change: an existing `data-intent-<x>` attribute (other than `data-intent-on`) is now read as the intent for event `x`; rename attributes that used that prefix for something else.
