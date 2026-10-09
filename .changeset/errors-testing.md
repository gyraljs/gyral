---
'@gyral/testing': patch
'@gyral/devtools': patch
---

`collectErrors()` collects the `GyralError`s Gyral reports (ADR 0024), so browser tests that make
a component fail on purpose don't fail the run; `step()` accepts the `Errored` framework message.
The devtools timeline shows failures as error rows.
