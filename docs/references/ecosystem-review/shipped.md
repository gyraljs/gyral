# Improvements present in Gyral 0.3.1

This is a disposition of historical feedback, not a list of unimplemented features.
The [consumer evidence](consumers.md) records source versions and the latest reports.
The [release changelog](../../../packages/core/CHANGELOG.md),
[migration reference](../migrating-0.3.0-to-0.3.1.md) and closed Beads establish shipped
scope. The own view layer and removal of Lit/Effect runtime dependencies predate 0.3.1;
they are part of the current foundation, not new work attributable only to this release.

That earlier work established a dependency-free core, Gyral's own template compiler and
renderer, in-place SSR/hydration, pure model testing and optional effect adapters. The
native-first audit also retained small fallbacks where browser availability or semantics
still require them. [Its findings](../native-first-audit-2026-10-11.md) explain why an
available native API does not automatically replace typed routing, cancellation policy,
virtual timers or synchronous CSP generation.

## Changes and practical effects

| Area                  | Present behavior and practical improvement                                                                                    | Closed work                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Native dialogs        | `?modal` opens after insertion, including initial and replacement views; focus-triggered updates are retained                 | `gyral-c5o`, `gyral-cps`, `gyral-1zd.27`     |
| Component boilerplate | Stateless components omit empty intent/update tables; tag-only parsers use `true`; explicit two-call generic definition       | `gyral-1zd.20`                               |
| Effect provision      | Typed driver tokens and ancestor provision remove throwing placeholders, spec driver duplication and unsafe casts             | `gyral-1zd.21`                               |
| Continuous lifetimes  | `subscriptions(state, props)` owns watches; time `every()` supplies epoch timestamps; one-shot effects remain explicit        | `gyral-1zd.19`                               |
| Commands              | Handlerless commands and `call()` remove no-op result messages while preserving effect boundaries                             | `gyral-1zd.21`, `.27`                        |
| Intents               | Parser state/props access, different parser and message names, per-event intent bindings, declined-event propagation          | `gyral-dyn`, `gyral-1zd.14`                  |
| Focus                 | Delegation into shadow children and bounded waiting for later targets; selection of a meaningful successor remains app policy | `gyral-dyn`, `gyral-1zd.15`                  |
| Templates             | `keyed()` deliberate remounts, boolean binding rule, child-first hooks, direct-parent outputs and slotted submission          | `gyral-1zd.25`, `.27`                        |
| Types and tests       | Generated element maps; public `mount()`/`parse()` and command/output assertions replace internal access                      | `gyral-1zd.25`, `.28`, `gyral-dyn`           |
| Forms                 | Definition-owned values/validation, secret-field and CSRF redaction, native form-associated components                        | `gyral-1zd.23`, `.29`, `.7`                  |
| SSR/server            | Shared head metadata, early scripts, arbitrary meta/link attributes, Node transport and asset/dev-server glue                 | `gyral-1zd.22`, `.26`, `gyral-dyn`           |
| Component loading     | Automatic islands, readiness signal, shadow discovery, folded modules/wrapper tag mapping and controlled preload cost         | `gyral-1zd.22`, `.29`, `.30`, `.31`          |
| Error handling        | Structured error channel and precise opt-in feature detection; unused state fields named `error` do not pull in error UI      | `gyral-1zd.8`, `.17`, `.29`                  |
| Native capabilities   | Optional/catch-all routes, distinct localStorage/IndexedDB drivers, EventSource SSE and WebSocket                             | `gyral-1zd.10`, `.32`, `.33`, `.34`, `.35`   |
| Distribution          | Nine stable npm packages, registry installs, create templates, packaged changelog and installed MCP verification              | `gyral-b2g`, `gyral-7se.11` and release work |
| Agent entry points    | Skill/plugin, llms documents, MCP API/examples/scaffolds, agent-aware create templates                                        | `gyral-7se.1`–`.4`                           |
| Portability evidence  | Small React/Vue/Svelte custom-element integrations; native SSR fixtures in Node, Deno and local workerd                       | `gyral-1zd.13`                               |

The [platform spike report](../platform-spikes-2026-10-11.md) states the last row's
exact scope. These are narrow interoperability fixtures, not deployed host-framework
SSR applications or production edge services. localStorage is synchronous browser
key/value storage; IndexedDB is asynchronous transactional structured storage. They
are separate drivers because their storage and lifetime contracts differ.

## Consumer code removed

Joystyk reports replacing 204 throwing driver defaults and 219 `AnyDriver` casts,
removing 108 no-op success handlers, moving 51 feed-starting definitions to subscriptions
(including the historical spike), and collapsing six event delegation wrappers. Its
current stable report adopts native modal bindings for 60 cancellable dialogs in 53
files. These counts describe that application's migrations, not framework byte savings.

Sabacc reports tag-only shorthand replacing seventeen parsers, omitting stateless tables,
moving continuous watches to subscriptions and implementing pending-playback recovery.
The last item needed explicit application run/step guards; Gyral did not automatically
infer a playback recovery policy.

starwars.run replaced manual island wiring and Node request/asset conversion, adopted typed
parser helpers and removed its theme-script ordering workaround. Stable migration removed
the vendor directory, core overrides and Docker tarball-copy step without further API edits.

The shop's next.7 adoption removed fourteen per-component driver declarations and shared
form/SSR boilerplate: 374 source/test lines deleted and 110 added. Later fixes removed
the CSRF cast and accidental error-view inclusion. Its automatic-loader size complaint
was investigated in an isolated branch: the final candidate with matching admin grouping
beat the manual loader's downloaded gzip bytes on all nine measured pages and all emitted
chunks. The [measurement report](../component-loading-size-2026-10-11.md) includes the
versions and limits; the main shop checkout has not yet adopted stable npm.

## Original Joystyk items 1–31

The dated next.1 report is retained in the consumer repository. Its requests have these
current dispositions; remaining integration guidance maps into the [feedback catalog](feedback.md).

| Original items                                  | Disposition in the current release                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1, 4: CSP styles and hashed CSS                 | CSSOM/client and hashed SSR support shipped; first-paint/hash-cap/dev-HMR guidance remains                            |
| 2: head after navigation                        | Shared head model/router updates shipped and adopted                                                                  |
| 3: persistent assets                            | Handler mechanics shipped; retaining old release assets remains deployment policy                                     |
| 5: trailing slash                               | Canonical matching path shipped; HTTP redirect remains server policy                                                  |
| 6: history focus/scroll                         | Fallback policy shipped; asynchronous content and successor selection need coordination                               |
| 7, 8: assertions and SSR browser tests          | Public helpers shipped; production/PWA tests still needed                                                             |
| 9: preload/SW warnings                          | Workaround and reproduction remain; a general Chromium 154 fix was not verified                                       |
| 10: streaming wording                           | Synchronous rendering versus streamed response transport clarified                                                    |
| 11: Node adapter                                | Shipped/adopted; origin, proxy, metrics, WebSocket and shutdown policy remains application-owned                      |
| 12: parser keys versus message tags             | Shipped; room-forwarding message boilerplate can disappear                                                            |
| 13, 15: press/release and multiple intents      | Event lists/per-event bindings shipped; complete continuous-input ownership is a recipe gap                           |
| 14, 19: shared feeds and fake-driver casts      | Subscriptions, tokens and fakes shipped; source sharing/provider ownership remains explicit                           |
| 16, 29: delegation and captured-pointer targets | Recipes exist; substantial native-input examples would improve them                                                   |
| 17, 28: parser props/state                      | Shipped; reflection/data attributes used only to access model context can disappear                                   |
| 18, 27: cross-list motion and restart           | FLIP/keyed recipes exist; no automatic cross-list motion/restart API promised                                         |
| 20: query/clipboard                             | App driver recipes; not new built-in commands                                                                         |
| 21: focus command typing                        | `Command<never>` and handlerless effects documented                                                                   |
| 22: native detail                               | Existing `input.detail` documented; safe narrowing remains required                                                   |
| 23: pure mapped rows                            | `each`/mapping patterns documented; row helpers remain normal application code                                        |
| 24: declined nested keys                        | Outer intent propagation shipped; editable-control filtering remains app policy                                       |
| 25, 31: focus after render/later target         | Delegation and bounded wait shipped; no global readiness or arbitrary shadow selector traversal                       |
| 26: prop identity                               | JSON structural equality and value identity/custom equality are distinct; identity props still need deliberate policy |

## Other historical complaints that should stay closed

Sabacc's stateless tables, tag-only parsing, continuous-subscription capability,
imperative-widget ownership documentation and missing packaged changelog are answered.
Its original command-inspection complaint was corrected by the consumer: `commandsFor`
and `inputsFor` already exist. `IntentNames` and `intentsOf` also exist; a type-only
`IntentsOf` request is a separate lower-priority ergonomics proposal.

starwars.run's npm availability, early scripts, `HeadMeta.media`, parser calls and
automatic island/server wiring are answered. Its coverage, inline style manifest,
static head marker and Node view-test requests remain distinct. A former size report
cannot be reused as a stable regression now that the application has a new search island.

Gymtime's Lit removal and planner decomposition were application refactoring: the former
2,607-line planner became model/intent/view modules and pages/components. The Rust
backend and its business rules remain authoritative. This is useful adoption evidence,
not proof that its still-vendored version has passed stable-release verification.
