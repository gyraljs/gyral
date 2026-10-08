---
'@gyral/router': patch
---

The History API fallback no longer imports anything at runtime. Its static import of the
render-settled helper made bundlers split the scheduler into extra chunks that every page
loaded, even in browsers that never fetch the fallback; apps now ship about 0.45 KiB gzip less
on every page and about 0.7 KiB less on pages that use the router.
