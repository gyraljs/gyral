---
'@gyral/core': patch
---

A `<noscript>` notice in a component's view no longer breaks hydration (gyral-qqa). The browser
keeps a server-rendered `<noscript>`'s content as text while scripts run, but the client's
template held it as elements, so every such notice was a hydration mismatch (G0062): development
threw and the component never hydrated; production rendered it fresh and warned (G0063).
Hydration now adopts a `<noscript>` element as it is, without comparing its content.

A `<noscript>`'s content is now server-only: a client render creates the element empty. Before,
Chromium and Safari built its markup as live elements, so a `<noscript><style>` applied to the
page and a `<noscript><img>` loaded while scripts ran. The development runtime no longer reports
such a notice as a template rule 7 repair. A `${…}` inside `<noscript>` was already template rule
3; its message now says to write the notice as static markup and keep what changes outside it.
