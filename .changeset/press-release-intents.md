---
'@gyral/core': patch
---

`data-intent-on` takes a list of events separated by spaces, so one intent can fire on press and
on release: `data-intent-on="pointerdown pointerup pointercancel"` or `"keydown keyup"`. The
parser reads `input.event.type` to tell them apart. The component root listens for every event
in the list. New element hook `capturePointer()` keeps a pressed pointer on its element
(`setPointerCapture`), so the release arrives even when it happens outside the element. The
client-only feature scan finds `command` inside a list too.
