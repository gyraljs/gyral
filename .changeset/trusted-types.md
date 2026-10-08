---
'@gyral/core': patch
---

Gyral works under Trusted Types. The browser parses template HTML (`html` and `svg`) and
`raw()` markup through one Trusted Types policy named `gyral`, created on first use where the
browser has `trustedTypes`, so a page whose Content Security Policy says
`require-trusted-types-for 'script'` renders instead of throwing "This document requires
'TrustedHTML' assignment". A policy that lists its allowed policies adds `gyral`:
`trusted-types gyral`. Without Trusted Types nothing changes. Tested in Chromium, Firefox and
WebKit (view/01-templates.md "Instantiation").
