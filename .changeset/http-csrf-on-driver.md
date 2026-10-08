---
'@gyral/http': patch
---

A CSRF token from a `<meta>` is configured once, on the driver: `makeHttpDriver({ headers: csrfFromMeta('csrf-token') })`. Apps that don't call `csrfFromMeta` don't bundle it. Development builds warn once when a non-GET request goes out without the token while the page has a CSRF `<meta>`. Behavior change: `HttpRequest.csrf`, `submitForm`'s `csrf: { meta }`, `makeHttpDriver({ retry })` and the `retry` option of `fakeHttp` are removed; use the driver setting above and `retry(makeHttpDriver(…), policy)`. `submitForm({ csrf: { token } })` stays.
