---
'@gyral/testing': patch
'@gyral/core': patch
---

`fakeDriver(name, run)` answers every call with `run` and records the inputs:
`el.drivers = { 'url-sync': fakeDriver<string | null, undefined>('url-sync', (query) => void urls.push(query)) }`.
Drivers and fakes go into `el.drivers`, `withDrivers` and `provideDrivers` with no cast: any
`Driver<I, O, E>` (typed error, `toError`, `retry`, a `subscription`, a fake) is assignable to
`AnyDriver`, now stated in core's `AnyDriver` and `DriverOverrides` docs and covered by type
tests. Type driver maps as `DriverOverrides`, not `Record<string, Driver<unknown, unknown>>`,
which rejects drivers with a typed input. No runtime change in core.
