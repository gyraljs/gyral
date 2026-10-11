# Gyral compared with six frameworks

This is an architectural comparison checked against official documentation on October 11, 2026. It is not a new benchmark or a comparison of renderer implementation source.
The pilot measured React 19.3.0 and Svelte 5.57.2 alongside Gyral 0.3.1; Preact, Vue,
Solid and Astro have no agent scores in that dataset. Current documentation can describe
newer capabilities than a historical benchmark's pinned packages.

## Component and state model

| Framework                                                      | Documented authoring model                                                                                                                          | Contrast with Gyral                                                                                                                                |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gyral 0.3.1                                                    | Typed events become messages; pure per-tag update; pure tagged-template view; commands/subscriptions through drivers; component is a custom element | Explicit effect and model boundaries are built in, with more types and named parts to learn                                                        |
| [React](https://react.dev/reference/react/useReducer)          | Function components/JSX with state hooks; `useReducer` accepts a pure reducer                                                                       | Pure reducer architecture is available, but command interpretation and an enforced MVI split are application choices                               |
| [Preact](https://preactjs.com/guide/v11/hooks/)                | JSX components and hooks, including reducers; optional [signals](https://preactjs.com/guide/v11/signals/) track reactive values                     | Can use a reducer architecture or reactive values; Gyral standardizes message and effect boundaries                                                |
| [Svelte](https://svelte.dev/docs/svelte/$state)                | Compiled components/templates with reactive `$state`; [effects](https://svelte.dev/docs/svelte/$effect) track dependencies                          | Less explicit message plumbing for small local interactions; Gyral asks for parsed intents and pure updates                                        |
| [Vue](https://vuejs.org/guide/extras/reactivity-in-depth.html) | Reactive objects/refs, templates and composable reactive logic                                                                                      | State can be changed through reactive code; Gyral constrains model transitions to messages/reducers                                                |
| [Solid](https://docs.solidjs.com/concepts/intro-to-reactivity) | Signals and tracked subscribers drive fine-grained updates, with JSX component authoring                                                            | Reactive dependency tracking replaces Gyral's message/update loop; pure domain functions remain possible in either                                 |
| [Astro](https://docs.astro.build/en/concepts/islands/)         | Server-rendered HTML with explicitly hydrated UI islands                                                                                            | A site/meta-framework rather than the same category of client state runtime; choose an island renderer before comparing interactive implementation |

Gyral's advantage is the **default organization of substantial behavior**: event decoding,
model transition and effect ownership are explicit and inspectable. It should not be
advertised as the only framework with pure logic or no-DOM model tests. A React reducer
can be called directly, and any framework can use an extracted pure domain module.
Gyral makes that separation its normal component contract and exposes model/command
testing seams. The consumers demonstrate its value; the pilot demonstrates onboarding cost.

## Lifetimes and asynchronous work

| Framework                                                        | Documented lifetime mechanism                                                                            | What remains application work                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Gyral                                                            | Driver commands, explicit concurrency lanes/keys, cancellation signals and state-derived subscriptions   | Worker termination, backend transactions, authorized projections, pending-step resume and shared resource ownership |
| [React](https://react.dev/reference/react/useEffect)             | Effect setup/cleanup with dependencies; cleanup before changed setup and on unmount                      | Cancellation and stale-result policy, effect architecture and retry/idempotency policy                              |
| [Preact](https://preactjs.com/guide/v11/hooks/)                  | Effect hooks with cleanup/dependencies; signals also provide effects                                     | Source lifetimes and request ordering still require deliberate design                                               |
| [Svelte](https://svelte.dev/docs/svelte/$effect)                 | Tracked effects with teardown on rerun/destroy                                                           | Network/worker cancellation, server mutation semantics and local draft reconciliation                               |
| [Vue](https://vuejs.org/guide/essentials/watchers.html)          | Watchers and cleanup; official example aborts stale requests                                             | Choosing the source, request concurrency, ownership and authorization boundaries                                    |
| [Solid](https://docs.solidjs.com/reference/lifecycle/on-cleanup) | Cleanup tied to a reactive owner, disposal or refresh                                                    | Which resources the owner controls and how async results remain relevant                                            |
| [Astro](https://docs.astro.build/en/concepts/islands/)           | Hydration policy determines when an island starts; interactive lifetimes belong to its selected renderer | Cross-island/backend coordination and application-owned external effects                                            |

These mechanisms are useful alternatives, not proof that another framework cannot
handle cancellation or subscriptions. Gyral's distinction is expressing them through
its command/subscription interpreter. Its remaining problem is teaching those contracts
consistently: an example that starts a continuous watch in `init` undermines that benefit.
The substantial worker, playback and booking recipes in `gyral-49t` are more valuable
than adding another interchangeable effect abstraction.

## SSR, islands and interoperability

| Framework                                                              | Documented server/interoperability surface                                                                                                       | Implication for this review                                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Gyral                                                                  | Framework-owned SSR/hydration, automatic custom-element islands, native Response/streams, separate Node serving glue                             | Consumer evidence covers Node apps and two Rust paths; sync rendering versus streamed transport must remain explicit |
| [React](https://react.dev/reference/react-dom/server)                  | String/static rendering and streaming server APIs; [custom HTML elements](https://react.dev/reference/react-dom/components#custom-html-elements) | Host/server integration still matters; small Gyral custom-element interop is already tested                          |
| [Preact](https://preactjs.com/guide/v11/server-side-rendering/)        | Separate SSR package supports HTML strings/streams; [custom elements](https://preactjs.com/guide/v11/web-components/) use properties/events      | Browser CE support does not automatically serialize complex properties into server HTML                              |
| [Svelte](https://svelte.dev/docs/svelte/svelte-server)                 | Server component rendering; SvelteKit adds application server configuration                                                                      | Component runtime and full application framework should be compared at matching layers                               |
| [Vue](https://vuejs.org/guide/scaling-up/ssr.html)                     | SSR rendering/hydration; [custom-element](https://vuejs.org/guide/extras/web-components.html) consumption and authoring                          | Native components are not exclusive to Gyral; verified host integration must specify its SSR scope                   |
| [Solid](https://docs.solidjs.com/reference/rendering/render-to-string) | Server rendering with hydratable output                                                                                                          | Fine-grained browser state does not remove the need for server asset and data contracts                              |
| [Astro](https://docs.astro.build/en/concepts/islands/)                 | Static/server HTML and selective client hydration                                                                                                | Closest comparison for the archive/island workload, but not a direct substitute for Gyral's reducer/driver model     |

Gyral's [platform fixtures](../platform-spikes-2026-10-11.md) establish small browser
property/update/output integrations in React, Vue and Svelte, and native SSR bundle
execution in Node, Deno and local workerd. They do not establish a complete Astro adapter,
host-framework SSR integration, or a deployed edge service. gyral-rs adds embedded V8
SSR inside Rust plus a separate Askama/client route; its exact current limits are in
the [Rust review](rust.md).

Native forms, accessible names, focus, dialog insertion and shadow event/ID scopes are
browser contracts. All these frameworks can build accessible applications; neither a
framework choice nor passing a few browser cases certifies all accessibility. Gyral's
native defaults help, but substantial examples and browser assertions must cover them.

Strict hash-based CSP is also not exclusive: [SvelteKit's CSP configuration](https://svelte.dev/docs/kit/@sveltejs-kit-vite#csp)
supports hash/nonce/auto modes, and [Astro's CSP configuration](https://docs.astro.build/en/reference/configuration-reference/#securitycsp)
generates style/script hashes with additional policy configuration. Gyral's actual gap
is a build-time inline shadow-style manifest and complete production recipes, not a
unique ability to cache pages under CSP.

## Agent and real-workload conclusions

The current pilot favors React and Svelte completion, but Gyral's failed traces never
attempted implementation. Different available documentation volumes, hidden budgets,
omitted MCP instructions and a latent generated-cache restriction limit causal claims.
Training familiarity is a hypothesis; no model training inventory was verified.

No current six-way score can be constructed by filling in unmeasured Preact, Vue, Solid
or Astro cells. A future study needs exact package versions, matched task documentation,
complete native onboarding, validated sandbox outputs and independent behavioral checks.
If Astro participates, specify its interactive island renderer and server/static contract.
Freeze the new protocol and retain every failure rather than reusing corrected continuations
as independent trials.

For real applications, the observed Gyral strengths are pure domain tests, explicit
effects, custom-element portability, native forms/dialogs and server/backend independence.
Observed weaknesses are skill consistency, migration/tooling friction and missing recipes
for larger ownership graphs. Package/community breadth and model familiarity may affect
adoption, but this audit did not quantify them. Renderer speed, bundle bytes and agent
completion are three separate measurements; historical app totals cannot rank 0.3.1
against today's other frameworks.
