# Real workload boundaries

The runnable [workload lab](https://github.com/gyraljs/gyral/tree/main/examples/workload-lab)
demonstrates these patterns. The lab and this guide are available since 0.3.2;
the lifetime rules and driver APIs they use already exist in 0.3.1. Start it in the framework checkout with
`pnpm examples workload-lab`. Read the companion files, not just the component's view.

## Work derived from state

For a sequence, model the run and step separately. Derive the pending delay in
`subscriptions` with a key containing both. Equal adjacent durations then represent
different work. Capture run/step in the reply and reject old or duplicate replies in update.
Unrelated state changes preserve an unchanged subscription. Stop removes it.

The lab explicitly chooses a **fresh full delay after true detach/reattach**. Persist an
absolute deadline and derive remaining time through a driver if your application needs
wall-clock continuation instead. A synchronous DOM move preserves the running delay;
`init` never replays on reattachment. These are different lifecycle events.

Create shared services, provider objects and configured drivers once per application/page
owner. Avoid recreating them in views. Replacing a driver implementation restarts its
running work; it does not rerun component init. Release `provideDrivers` when that owner
ends. A component releases its watch; it must not dispose the shared service.

Props follow their declared equality: scalar/value defaults use `Object.is`; `prop.json`
defaults compare JSON serialization. `prop.value` and `prop.json` accept a custom `equals`.
Compare the fields that govern a computation, such as an ID and revision; do not assume
every new object restarts work, or that in-place mutation of a value prop is observable.

`focus(selector, { wait: true })` searches the component's own root after its renders, lasts
at most one second, and is replaced by a newer focus request. It does not search inside a
child component's shadow root. Request focus from the reducer that receives ready data
when loading may take longer. `settled()` does not extend that deadline or await the network.

## Owned workers

The lab's solver driver creates one module Worker per command and passes a data-only job.
It validates replies and their job ID, rejects errors/decoding failures, and removes every
listener and terminates the worker on completion, cancellation or failure. Model guards
also reject old job replies. Worker creation and execution stay outside update/view.

A running-state subscription resumes work after reattachment. Changing its job replaces
the previous command. Module workers are built with `new URL('./solver.worker.ts',
import.meta.url)`. Their script and imports must be included in deployment/offline assets.

## Authoritative snapshots and local drafts

Keep authorized snapshots separate from edits keyed by stable row IDs. A newer snapshot
updates authoritative rows without overwriting drafts; retain each draft's base version
for an optimistic conflict check. Drop drafts for rows no longer visible. Viewer changes
clear old rows/drafts/pending work immediately and increment a generation. Ignore responses
from an old generation or an older snapshot revision.

Freeze a write's payload and obtain a unique idempotency key through a driver. Retry an
ambiguous failure with exactly the same key and payload, even if the user has since edited
the draft. The backend must bind keys to the authenticated actor and payload, record the
receipt transactionally, and enforce authorization/version constraints. A client-provided
viewer flag is **not authorization**; the lab's service is only an in-memory demonstration.

An acknowledged commit followed by a failed reload is a committed write. Retry the read,
not the mutation. Preserve edits made while the write was pending. Aborting a command stops
local observation; it cannot undo an already committed server transaction.

`bookingDrivers` accepts an application-owned `BookingRuntime`. An app using Effect can
implement its read/save methods through one `ManagedRuntime.runPromise(effect, { signal })`,
and its watch through its service's subscribe/release operation. Construct that runtime once,
keep request authentication scoped to the backend operation, and call `runtime.dispose()`
only when the application owner ends. Do not create/dispose a managed runtime for each
component or introduce an Effect dependency into Gyral packages.

## Held input, widgets and capture readiness

Use press/release messages and a state-owned `every` subscription for continuous movement.
Ignore repeated native keydown events; stop on keyup, focus leaving the widget, window blur
and page visibility loss. Retain ordinary buttons and readable text alternatives.

Pointer capture retargets moves to the capturer. Hit-test cell coordinates separately and
handle pointerup, pointercancel and lostpointercapture. The lab uses bounded cell rectangles
instead of relying on a shadow root's `elementFromPoint`. Give drag surfaces `touch-action:
none` and controls a 44px minimum target. It uses no animation, including with reduced motion.

A canvas hook owns its ResizeObserver and font listeners, reuses them on updates, and
disconnects them on disposal. A late fonts-ready promise checks whether its owner still
exists. SVG is a pure view. The selected value also appears as accessible text.

For document popovers containing shadow components, document listeners see the host as
`event.target`; `composedPath()` reveals the original event path. IDs do not cross shadow
roots. The lab feature-detects `ariaDescribedByElements` for an ancestor-document description
and supplies a scoped `aria-describedby` fallback. Popovers are an enhancement; unsupported
engines show the help as ordinary document content.

Before screenshots or accessibility audits, wait for the specific worker result, widget
`data-ready` condition and `document.fonts.ready`, then `settled()` for model/DOM work.
Do not substitute fixed sleeps or treat `settled()` as global visual/network readiness.

Native form constraints run before submit intents. Test `ValidityState`, absence of writes
on invalid submit, the parsed numeric/checkbox payload, and the resulting state/receipt.
The lab does this with multiple controls; seeing an input on screen is insufficient.

## Type boundaries

Native custom-event `detail` remains unknown until a guard/schema validates it. A generic
annotation on an event does not validate the data. `parse(Component, name, input, { state,
props, stores })` supplies parser context without consumer casts, including keyboard tests.

Separate read/write drivers give each command a precise result type. A combined driver
returning a union requires a discriminant check in `onSuccess`. The tested fixture in
`packages/ssr/test/consumer-types.node.test.ts` compares both. Existing
`ReturnType<typeof intentsOf<typeof Component>>` expresses inferred intent names;
`commandsFor`/`inputsFor` inspect commands by public driver, without private string names.

Static-only metadata can use `renderPage({ title, extraHead })` without ownership markers.
Use normal managed `Head` fields for client navigation, and never duplicate an entry across
both paths. The five-entry fixture adds 164 raw/37 gzip bytes for managed ownership;
no extra opt-out API is needed for that measured case.

Native references: [pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture),
[scoped ARIA element references](https://developer.mozilla.org/en-US/docs/Web/API/Element/ariaDescribedByElements).
