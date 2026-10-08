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
  1: '<{tag}> is a browser element (render it with @gyral/core/server).',
  10: '<{tag}> has no update for message "{message}".',
  11: '<{tag}> has no intent parser for data-intent="{intent}".',
  12: '<{tag}> intent parser for "{intent}" failed',
  13: '<{tag}> focus("{selector}") matched no focusable element.',
  // Props
  20: '<{tag}> prop "{prop}" has an asynchronous schema; it must be synchronous.',
  21: '<{tag}> prop "{prop}" got an invalid value from {source}, so it is treated as missing: {issues}',
  22: '<{tag}> is missing required prop(s): {props}.',
  23:
    '<{tag}> declares prop(s) that shadow built-in element properties: {props}. Setting them ' +
    'changes platform behaviour (a prop named "hidden" hides the element). Rename them ' +
    '(view/05-element.md).',
  // Scheduling
  30: 'gyral: a deferred callback failed',
  31: '<{tag}> failed to render; its previous DOM stays.',
  32: 'gyral: post-render work failed',
  33:
    'gyral: rendering did not settle in one flush (a cycle between {tags}). Components are ' +
    'probably feeding each other props or messages; break the cycle with a condition in update ' +
    '(docs/design-docs/view/04-scheduler.md "Loop guard").',
  34:
    'settled(): the page did not settle after {rounds} flushes or busy turns. A stream is ' +
    'emitting without pause, or components (or drivers) are feeding each other messages in a ' +
    'cycle.',
  // Commands
  40: 'gyral: command mapper threw',
  41: 'gyral: unhandled failure from driver "{driver}"',
  42: 'gyral: subscription "{name}" failed to unsubscribe',
  // Stores
  50:
    '<{tag}> uses store "{store}" without declaring it. Add it to the spec: stores: [{store}] ' +
    '(ADR 0013), so the component subscribes to its changes.',
  51: 'store "{store}": the server\'s seed failed its schema, so it starts from init. Issues: {issues}',
  52: 'unreadable {attribute} seed on {where}',
  53:
    '<{tag}> reads store "{store}" during a server render without a store scope. Pass the ' +
    "request's store instances to page({ stores }) or renderToString(value, { stores }).",
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
    '(docs/design-docs/view/07-hydration.md "Mismatches").',
  63: '<{tag}> was rendered fresh after a hydration mismatch:',
  // Templates
  70:
    'gyral: an html template was not compiled: `{start}`. Under the gyral-compiled condition ' +
    'every html`…` must be compiled by the Gyral Vite preset (view/01-templates.md).',
  71: 'gyral: template rule 11: a page shell rendered in the browser.',
} as const;
