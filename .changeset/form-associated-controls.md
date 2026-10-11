---
'@gyral/core': patch
---

Add opt-in form-associated components with pure value/validity projections and typed native
reset, disabled-state and restoration messages. Forms and custom states share ElementInternals;
compiled applications include form machinery only when a spec names formAssociated.
