# Platform compatibility spikes — 2026-10-11

Results for gyral-1zd.13 against `next` at `78052c4`, plus the native-promise and timer fixes
from the same audit. These are narrow compatibility checks, not a promise that an entire
application is portable without testing its dependencies and deployment.

## Reproduce

Run `pnpm verify:platforms` after installing the repository and Playwright Chromium. This
optional networked command installs pinned React, Vue, Svelte and Wrangler packages in a
temporary directory, bundles the public Gyral entry points and removes the temporary files
afterward. It does not add host packages to Gyral's dependencies or deploy a Worker.
Other renderers are used as black boxes; no implementation source is inspected or copied.

Fixtures: `scripts/spikes/host-component.mjs`, `hosts.mjs`, `Host.svelte` and `runtime.mjs`.
The runner is `scripts/verify-platforms.mjs`.

| Boundary                 | Result and recommendation                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React 19.2.8             | Client mount, array property assignment/update and the exact-case `'ongyral-output'` handler through `createElement` pass. Define the custom element before mounting; use a DOM ref listener where JSX event typing is inconvenient.              |
| Vue 3.5.43               | `isCustomElement`, `.prop` array assignment/update and `@gyral-output` pass. Configure custom elements in the actual template compiler, including the Vite plugin for SFC apps.                                                                   |
| Svelte 5.57.2            | Array property assignment/update and an effect-installed output listener pass. Import the element before mounting and remove listeners in effect cleanup.                                                                                         |
| Node 24.15.0             | The self-contained server bundle produces a native `Response`/`ReadableStream`, multiple pulled chunks, DSD and slotted markup, request-specific stores, a CSP header and a cancellable reader.                                                   |
| Deno 2.9.6               | That same bundle passes without a DOM shim or runtime permissions. Use the web-standard `renderPage` entry; platform adapters and application imports remain separate checks.                                                                     |
| Local Cloudflare workerd | The same bundle passes through Wrangler 4.147.0's `createTestHarness`, with compatibility date `2025-01-01` and no `nodejs_compat`. Recommend the native Response entry for Workers; deployed edge behavior, bindings and assets were not tested. |

The host checks run in Chromium, with production dependency conditions. They exercise client
mounts, not the host frameworks' SSR or hydration. Host SSR ordinarily emits a custom tag;
Gyral's renderer supplies the Gyral view and hydration seed. Do not mix the two ownership
models without a separate integration design.

## Slots and hydration

Native light children slotted into a **shadow component** are supported. Core's existing
`test/view/conformance-components.ts` and `conformance-hydration.test.ts` cover slotted
children and property props during client rendering and SSR hydration, including a nested
light-DOM parent. Hydration runs in both development and production browser projects.
`test/intent-ownership.test.ts` additionally verifies that the outer component owns intents
and outputs in its slotted content.

A component declared `shadow: false` has no shadow tree into which it can project a slot; it
owns and renders its light children ([ADR 0014](../design-docs/0014-light-dom.md)). Use a
shadow component for slot projection and a light component for page-level document layout.
No new slot mechanism is needed.

## Accessibility helper

Recommend a small **application-level** Playwright/axe helper instead of a new
`@gyral/testing` API or dependency. The host fixture runs `axe.run` while each component is
mounted, asserts zero violations and verifies that the `button-name` rule scanned a button
inside the open shadow root. This prevents an empty or wrong-root scan from passing silently.

The website's testing guide includes a typed `expectAccessible(page)` helper using
`@axe-core/playwright`. Await the app's ready condition, scan meaningful interaction states
in light and dark, then test keyboard/focus behavior separately. This website's gate already
applies axe to every built page; automated checks do not replace screen-reader evaluation.

## Primary references

- [React custom HTML elements](https://react.dev/reference/react-dom/components#custom-html-elements)
- [Vue and web components](https://vuejs.org/guide/extras/web-components.html)
- [Svelte custom elements](https://svelte.dev/docs/svelte/custom-elements)
- [Cloudflare Wrangler integration-test API](https://developers.cloudflare.com/workers/wrangler/api/)
