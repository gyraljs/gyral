---
'@gyral/core': patch
---

`prop.value()` and `prop.json()` accept a plain type guard (`(u: unknown) => u is T`) as well as a
Standard Schema; the prop's type is the guard's `T` (new type `PropGuard<T>`). The docs now spell
out prop identity: a property set keeps the object it was given (development validates it and
stores the input, production skips the schema), so schemas for properties should check, not
decode.
