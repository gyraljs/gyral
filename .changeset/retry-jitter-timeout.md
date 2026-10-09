---
'@gyral/core': patch
'@gyral/http': patch
---

`retry(driver, policy)` takes `jitter: true` (full jitter on the backoff delay) and
`retryIf(error)` (retry only the failures it accepts, given the driver's typed error).
`@gyral/http` adds `makeHttpDriver({ timeoutMs })`, a per-attempt time limit that fails with the
new `HttpTimeoutError`, and `retryableHttpError`, a `retryIf` for network errors, timeouts,
408, 429 and 5xx:

    retry(makeHttpDriver({ timeoutMs: 8000 }), {
      times: 3, delayMs: 300, backoff: 'exponential', jitter: true, retryIf: retryableHttpError,
    });

Behavior change: `HttpError` has a new variant, `HttpTimeoutError`; exhaustive switches over its
`_tag` need a case for it.
