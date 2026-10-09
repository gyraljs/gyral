---
'@gyral/core': patch
'@gyral/router': patch
'@gyral/time': patch
---

Drivers have one override rule, and commands need less ceremony (ADR 0006 addendum).

- Behavior change: the spec's `drivers` field is removed. A command's driver resolves from
  `el.drivers`, then the nearest provider (`provideDrivers`, `<gyral-drivers>`), then the
  command's own driver. Configure app-wide drivers once at the entry:
  `provideDrivers(document.body, { router: makeRouter({ captureLinks: true }) })`.
- `defineDriver<I, O, E>('name')`, or `defineDriver({ name, toError })` without `run`, returns a
  typed driver token: commands built from it are typed, and it runs only when a provider or
  `el.drivers` supplies a driver of that name. A token nothing provides is reported as G0043,
  naming the driver and the component. New type `DriverToken`.
- `command(driver, input)` takes no handlers for fire-and-forget effects and returns
  `Command<never>`; every handler field is optional. The message type parameters are `const`, so
  `onSuccess: (n) => ({ _tag: 'Loaded', n })` infers the literal tag without type arguments.
