---
'@gyral/core': patch
'@gyral/testing': patch
---

Typed driver provision (gyral-337.2): a driver token provides its own implementation,
`token.provide(run)` (named by the token, `run` typed by its input and output), and
`subscription(token, subscribe)` is a subscription named and typed by its token. Drivers can be
supplied as a list, each under its own name: `provideDrivers(root, [session.provide(run)])`,
`el.drivers = [fake]`, `<gyral-drivers>`, `mount({ drivers })` and stores. Records keep working;
development throws G0044 for two drivers of one name in a list and warns (G0045) when a
record's key isn't its driver's name.
