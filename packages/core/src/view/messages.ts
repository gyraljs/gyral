// Core's diagnostics, by code (gyral-c5d.13, docs/references/errors.md). Development
// builds print the full text, production builds `Gyral G0010 <arguments…> <docs URL>`
// (message.ts), so this table stays out of production bundles. `{name}` placeholders take the
// call's arguments in order of first appearance; a name used twice repeats its argument.
// docs/references/errors.md and errors.json are generated from this table (`node
// scripts/errors.mjs`); `pnpm invariants` checks that they are current, that codes are unique
// and that every `message(code, …)` call names a code here with as many arguments as its text
// has placeholders (`docsLink(code)` marks a message that keeps its own sentence in
// production). Codes are never reused: a retired message keeps its code out of use.
// Plain data, no TypeScript beyond `as const`, so Node scripts import it as is.
export const MESSAGES = {
  // Components
  1: '<{tag}> is a browser element (render it on the server with @gyral/ssr).',
  10: '<{tag}> has no update for message "{message}".',
  11: '<{tag}> has no intent parser for data-intent="{intent}".',
  12: '<{tag}> intent parser for "{intent}" failed',
  13: '<{tag}> focus("{selector}") matched no focusable element.',
  14:
    '<{tag}> is on the page, but no custom element named "{tag}" is defined {seconds} s after ' +
    'it loaded, so it renders nothing. If it is one of your components, import the module ' +
    "that calls define()('{tag}', …) from the entry; for a third-party element, load its " +
    'package. Ignore this for an element defined later on purpose.',
  // Props
  20: '<{tag}> prop "{prop}" has an asynchronous schema; it must be synchronous.',
  21: '<{tag}> prop "{prop}" got an invalid value from {source}, so it is treated as missing: {issues}',
  22: '<{tag}> is missing required prop(s): {props}.',
  23:
    '<{tag}> declares prop(s) that shadow built-in element properties: {props}. Setting them ' +
    'changes platform behaviour (a prop named "hidden" hides the element). Rename them.',
  // Scheduling
  30: 'gyral: a deferred callback failed',
  31: '<{tag}> view failed; it shows its error view, or its previous DOM stays.',
  32: 'gyral: post-render work failed',
  33:
    'gyral: rendering did not settle in one flush (a cycle between {tags}). Components are ' +
    'probably feeding each other props or messages; break the cycle with a condition in update.',
  34:
    'settled(): the page did not settle after {rounds} flushes or busy turns. A stream is ' +
    'emitting without pause, or components (or drivers) are feeding each other messages in a ' +
    'cycle.',
  // Commands
  40: '{owner}: the onSuccess or onFailure mapper for driver "{driver}" threw; no message was sent.',
  41: '{owner}: driver "{driver}" failed and the command has no onFailure.',
  42: 'gyral: subscription "{name}" failed to unsubscribe',
  43:
    '{owner}: no driver provides "{driver}". It is a driver token: provide an implementation ' +
    'by name with provideDrivers(root, { {driver}: … }) or el.drivers.',
  // Stores
  50:
    '<{tag}> uses store "{store}" without declaring it. Add it to the spec: stores: [{store}], ' +
    'so the component subscribes to its changes.',
  51: 'store "{store}": the server\'s seed failed its schema, so it starts from init. Issues: {issues}',
  52: 'unreadable {attribute} seed on {where}',
  53:
    '<{tag}> reads store "{store}" during a server render without a store scope. Pass the ' +
    "request's store instances to renderPage({ stores }) or renderToString(value, { stores }).",
  54:
    'store "{store}" sends to "{target}" but is not held by a store scope (a registry, ' +
    '<gyral-stores> or the page default), so the message is dropped.',
  55: 'store "{store}" has no update for message "{message}".',
  // Hydration
  60: '<{tag}> has an unreadable {attribute}',
  61: 'gyral: hydration code failed to load; rendering fresh',
  62:
    "gyral: hydration mismatch in {host} at {path}: expected {expected}, found {found}. The server's " +
    "HTML differs from the first client render: a view that isn't deterministic (Date.now(), " +
    'locale), a third party that changed the DOM before scripts ran, or a stale cached page ' +
    '(https://gyral.dev/docs/server-rendering/#mismatches).',
  63: '<{tag}> was rendered fresh after a hydration mismatch:',
  // Templates
  69:
    '<{element}> ?{binding} does nothing: this build left the dialog and popover code out, ' +
    'because no module the build scanned binds it (a package that does not depend on Gyral ' +
    'is not scanned).',
  70:
    'gyral: an html template was not compiled: `{start}`. Under the gyral-compiled condition ' +
    'every html`…` must be compiled by the Gyral Vite preset.',
  71: 'gyral: template rule 11: a page shell rendered in the browser.',
  72:
    'gyral: this page\'s Trusted Types policy list does not allow the policy "gyral", so ' +
    'templates are parsed from plain strings, which works only while Trusted Types are not ' +
    'enforced. Add `trusted-types gyral` to the Content-Security-Policy.',
  // Error handling
  73: '<{tag}> update for "{message}" failed; the state is unchanged.',
  74: '<{tag}> init failed; it shows its error view, or stays empty.',
  75: '<{tag}> element hook failed; the other hooks still ran.',
  76: 'store "{store}": update for "{message}" failed; the state is unchanged.',
  77: 'store "{store}": a subscriber failed; the other subscribers were still notified.',
  78:
    '<{tag}> failed to render on the server; it renders its error view (or nothing) and ' +
    'starts fresh in the browser.',
  // Subscriptions
  79:
    '<{tag}> subscriptions returned two commands for lane "{lane}"; only the first runs. ' +
    'Give each its own `key`.',
  80:
    "<{tag}> subscriptions kept restarting: a subscription's input data changes with every " +
    'message it sends (for example a timestamp or a counter in the input). Keep inputs to what ' +
    'should restart it; functions are ignored, so to restart on a new selector, change the key.',
  // Element calls
  85: '<{tag}> call("{selector}", "{method}") failed',
  86: 'call("{selector}", "{method}"): arguments must be plain data.',
} as const;
