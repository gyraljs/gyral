---
'@gyral/router': patch
---

Scroll and focus after a navigation, the same on both paths. Once the new page has rendered
(`settled()`), the browser router scrolls to the `#fragment` target or the top (push),
restores the scroll position on back/forward, and resets focus to the first `[autofocus]`
element or the page start, unless the app moved focus during the navigation (the recommended
`focus('main h1')` from the `Routed` reducer). The Navigation API path now intercepts with
`intercept({ handler, scroll, focusReset })`, so the browser does this after the render instead
of against the old page (a fragment only the new page renders was missed); the History API path
did none of it and now does the same steps. Opt out with `navigate(url, { scroll: false,
focusReset: false })` or `makeRouter({ scroll: false, focusReset: false })`; new type
`NavigateOptions`. The History API path now loads with `import()` only in browsers without the
Navigation API (ADR 0003 tier 3), so a navigation there resolves a moment later on first use; if
that chunk can't load, navigations become full page loads. A `replace` leaves scroll and focus
alone unless `navigate(url, { replace: true, scroll: true, focusReset: true })`, and back/forward
to an entry with the same path and query is left to the browser on both paths. See ADR 0009
"Scroll and focus".
