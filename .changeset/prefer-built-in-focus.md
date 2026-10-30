---
'@gyral/core': patch
---

`gyral/prefer-built-in` warns about `.focus()` in a driver only when the element is reached
through a component's shadow or render root (`x.shadowRoot.querySelector(s).focus()`, or a
local name for that root), which the `focus(selector)` command replaces (gyral-um2). Before, it
warned about every `.focus()` in a driver, also on a page element outside any component
(`document.querySelector`, `getElementById`) or one the driver is handed, which `focus()` can't
reach: it searches only the component's own root. Such drivers no longer warn; drop any
`eslint-disable` you added for them.
