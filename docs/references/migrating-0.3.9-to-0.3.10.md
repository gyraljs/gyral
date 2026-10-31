# Behavior changes in 0.3.10

Gyral 0.3.10 fixes what migrating apps to 0.3.9 found (epic gyral-uvj). Each section below
stands on its own: changes a working app can notice first, each with what to do, then new
checks and workarounds you can remove.

## `<noscript>` in a view (gyral-qqa)

### Behavior changes

| Change                                                                                                                                | Before 0.3.10                                                                                                                                                                                                        | What to do                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A component whose view holds a `<noscript>` notice hydrates: the `<noscript>` element is adopted as it is, its content never compared | Hydration reported a mismatch (G0062) for every such notice: development threw, so the component never hydrated; production rendered it fresh and warned (G0063). The development runtime also reported it as rule 7 | Nothing                                                                                        |
| A `<noscript>`'s content is server-only: a client render creates the element empty                                                    | Chromium and Safari built its markup as live elements while scripts ran: a `<noscript><style>` applied to the page, a `<noscript><img>` loaded                                                                       | Nothing, unless a script read the notice's elements on the client: render that content outside |

Details: [view/09-template-rules.md](../design-docs/view/09-template-rules.md) "`<noscript>`
since 0.3.10", [view/07-hydration.md](../design-docs/view/07-hydration.md) "The parallel walk".

### Messages

- **A `${…}` inside `<noscript>`** was already an error (template rule 3, in `vite build`, the
  runtime and ESLint). Its message now says why and what to write: the notice as static
  markup, with anything that changes outside the `<noscript>`. Attributes of the `<noscript>`
  element itself may still be bound.

### Workarounds you can remove

- **A notice kept outside the component** (in the page's HTML, or rendered only when not
  hydrated) to avoid the mismatch: move it back into the view, next to the controls it stands
  in for.
