---
'@gyral/core': patch
'@gyral/testing': patch
---

Retries are a driver wrapper: `retry(driver, { times, delayMs?, backoff? })` returns the same driver (same name, so substitution still works) with failed runs retried, and an abort ends it at once. The runtime runs a driver once, so apps that never call `retry` don't bundle the delay code (about 0.1 KiB gzip less for apps with commands). Behavior change: `Driver.retry`, `subscription(…, { retry })` and the `retry` option of `fakeDriver` are removed; wrap the driver or the fake instead.
