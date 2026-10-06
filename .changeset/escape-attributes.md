---
'@gyral/core': patch
---

The server renderer escapes `<` and `>` in attribute values and in the seed attribute too, so
no markup (such as `<script>`) appears raw inside an attribute. Browsers decode them, so values
and hydration are unchanged.
