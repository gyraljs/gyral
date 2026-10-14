---
'@gyral/mcp': patch
---

The stdio server's nudge now counts every read since the last `scaffold_component` or
`check_snippet`, not only `get_api` calls: `start_here`, `search_docs`, `get_doc`, `get_api`,
`list_examples`, `get_example` and resource reads. In 0.3.4, `get_example` reset the count, so
an agent could read ten examples in a row and never be told to write. From the third
`get_example`, the fourth `get_api` or the eighth read of any kind, tool answers end with a
nudge to adapt the closest example already read (by name) and run `check_snippet`, or, with no
example read, the next call for the task. The stateless HTTP server still never nudges.
