---
'@gyral/core': patch
---

**Behaviour change:** a client-rendered component's `init` commands now start after its first
render, as a server-rendered component's always did (gyral-k97.3). They started when the
element connected, which for an element already in the page is inside `define()`, so a page
entry that statically imports its components ran them before its own `provideDrivers()`: a
driver token failed with G0043, and a driver with a default silently ran the default instead of
the page's override. `provideDrivers()` anywhere in the entry's synchronous code is now in time.

- A driver that answers synchronously during `init` delivers its message after the first
  render: one more render, in the same task.
- A component whose first render throws starts its `init` commands once a render succeeds.
- A component removed before its first render starts them once it is attached and renders.
- G0043 now says how to order a page's boot: provide drivers before importing components, or
  later in the same task, with no `await` in between (or set `el.drivers` on an element built
  in code before inserting it).
