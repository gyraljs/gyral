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

## Hydration mismatches in development (gyral-uvj.3)

### Behavior changes

| Change                                                                                                                                                                                  | Before 0.3.10                                                                                                                                                                                                  | What to do                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| In development, a component whose server DOM doesn't match its first render is rendered fresh, as in production, and works                                                              | Development threw the mismatch: the component kept the server's DOM, no render updated it, and every render tried to hydrate again                                                                             | Nothing. Fix the mismatch the error names                                                                                                          |
| Development logs the mismatch with `console.error`: G0062 (component, template call site, DOM path, expected and found, the explanation), then G0063. Production still warns, unchanged | The scheduler reported it as a view failure (G0031, phase `view`, ADR 0024): the component's `error` view rendered, ancestors got its bubbling `error` event, `window` `error` listeners and monitoring saw it | A test or boundary that expected a development mismatch as a `GyralError` (`collectErrors()`, an `error` view): look for the console error instead |

Details: [view/07-hydration.md](../design-docs/view/07-hydration.md) "Mismatches",
[ADR 0018](../design-docs/0018-view-layer.md) "Addendum: hydration mismatches recover in
development (0.3.10)".

### Messages

- **Hydration tests** still fail on a mismatch: `@gyral/testing`'s `hydrated()` fails on any
  console error or warning, in development and production builds of core. In development the
  failure now quotes the mismatch itself; before, it read "view failed" (G0031) and the
  mismatch was only the error's `cause`.
