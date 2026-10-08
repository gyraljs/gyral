---
'@gyral/core': patch
'@gyral/router': patch
'@gyral/ssr': patch
---

Fixes found reviewing 0.3.1: adjacent static `data-intent-<event>` attributes (and those in `raw()` markup) are all listened for; `toNodeListener` no longer stalls a keep-alive connection when the handler doesn't read the request body, cancels the response body when the client left before it started, and survives a throwing `onError`; `assetHandler` counts a file once when concurrent requests miss it together; if the router's History API chunk fails to load, navigations become full page loads; back/forward to an entry with the same path and query is left to the browser on both router paths.
