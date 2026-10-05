---
'@gyral/testing': patch
---

`step()` and `run()` accept the `Hydrated` framework message, so `Hydrated` reducers can be
unit-tested; without a reducer it leaves state unchanged, as in the element.
