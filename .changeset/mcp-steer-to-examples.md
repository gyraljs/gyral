---
'@gyral/mcp': patch
---

Steer agents from browsing types to working code. `get_api` on a function with a matching
example (`define`, `html`, `each`, `intentsOf`, `fieldErrors`, `invalid`, `focus`, `form`,
`every`, `command`, …) appends a short typechecked usage module and the next call, such as
`scaffold_component({ tag: "signup-form", kind: "form-native" })`; on a type it adds a one-line
note that TypeScript infers it and that `check_snippet` names the real type errors. From the
fourth `get_api` call since the last `get_example`, `scaffold_component` or `check_snippet` in a
stdio session, answers end with a nudge naming the next call for the task (the stateless HTTP
server keeps no such state). `get_api("*")` groups the functions by task, with the example or
scaffold to start from, and collapses the types. The server instructions and tool descriptions
lead with the workflow, and the bundled skill's forms reference leads with native validation.
