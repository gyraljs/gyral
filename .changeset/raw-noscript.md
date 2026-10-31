---
'@gyral/core': patch
---

A `<noscript>` inside `raw()` markup is now inserted empty in the browser (gyral-uvj.2), as a
`<noscript>` in a template already is in this release. Before, Chromium and Safari parsed the
notice's markup into live elements while scripts ran, so a `<noscript><style>` applied to the
page and a `<noscript><img>` loaded; Firefox inserted it as text. The server still writes
`raw()` markup verbatim, so visitors without JavaScript see the notice, and hydration keeps the
server's notice as it is. If a script read the notice's elements on the client, render that
content outside the `<noscript>`.
