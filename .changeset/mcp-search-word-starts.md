---
'@gyral/mcp': patch
---

`search_docs` matches query words only at the start of a word (gyral-99t). "rust" no longer
matches inside "trusted", so the Rust servers guide comes first for it instead of Trusted Types.
Prefixes still match ("hydrat" finds "hydration"), and so do the words of a camelCase name
("changed" finds `PropsChanged`, "action" finds `formAction`).
