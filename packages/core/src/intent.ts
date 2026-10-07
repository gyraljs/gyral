import { loadInvokerShim } from '#invoker-fallback';
import { commandOf, invokersSupported } from './invokers.js';
import type { IntentInput, IntentNames, IntentParser, Tagged } from './types.js';
import type { Markup } from './view/index.js';

/** Event a child component dispatches on its host to send an output up (ADR 0010); public. */
export const OUTPUT_EVENT = 'gyral-output';

/** Default triggers (`defaultTrigger`): every component root listens for these. */
export const DEFAULT_EVENTS: readonly string[] = [
  'click',
  'submit',
  'input',
  'change',
  OUTPUT_EVENT,
];

/**
 * The events `data-intent-on` usually names. A component root listens (capture phase, so
 * non-bubbling events such as `toggle` are seen too) for the defaults, for `spec.events`, and
 * for the `data-intent-on` values in the templates it renders; a template that binds
 * `data-intent-on` dynamically adds all of these (view/05-element.md "Intent events").
 */
export const INTENT_EVENTS: readonly string[] = [
  ...DEFAULT_EVENTS,
  'keydown',
  'keyup',
  'focusin',
  'focusout',
  'toggle',
  'command',
];

/** A static `data-intent-on` value, quoted or not (event names have no spaces or quotes). */
const INTENT_ON = /\sdata-intent-on=["']?([^"'\s>]+)/gi;
const eventsByTemplate = new WeakMap<Markup, readonly string[]>();

/** The intent events a template's (or `raw()` markup's) `data-intent-on` attributes name. */
export function eventsOf(markup: Markup): readonly string[] {
  let events = eventsByTemplate.get(markup);
  if (events === undefined) {
    events = markup.parts?.some((p) => p[2] === 'data-intent-on') // a bound attribute's name
      ? INTENT_EVENTS
      : Array.from(markup.html.matchAll(INTENT_ON), (m) => m[1] ?? '');
    eventsByTemplate.set(markup, events);
  }
  return events;
}

const isToggle = (el: Element): el is HTMLInputElement =>
  el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');

// ToggleEvent (popover, <details>) is not Baseline widely available; read it structurally.
function toggleState(event: Event): 'open' | 'closed' | undefined {
  if (event.type !== 'toggle' || !('newState' in event)) return undefined;
  return event.newState === 'open' ? 'open' : 'closed';
}

const CLICK_INPUT_TYPES = /^(button|submit|reset|image)$/;

/** The event that fires an intent unless `data-intent-on` overrides it. */
export function defaultTrigger(el: Element): string {
  switch (el.localName) {
    case 'form':
      return 'submit';
    case 'select':
      return 'change';
    case 'textarea':
      return 'input';
    case 'input': {
      const type = (el as HTMLInputElement).type;
      if (CLICK_INPUT_TYPES.test(type)) return 'click';
      return type === 'checkbox' || type === 'radio' ? 'change' : 'input';
    }
  }
  // Custom elements (autonomous: the name has a dash) talk to their parent via outputs.
  return el.localName.includes('-') ? OUTPUT_EVENT : 'click';
}

function triggerOf(el: Element): string {
  return el.getAttribute('data-intent-on') ?? defaultTrigger(el);
}

/** Every class `define()` creates, so intent lookup can tell where a component begins. */
const hostClasses = new WeakSet<object>();

export function markGyralHost(ctor: object): void {
  hostClasses.add(ctor);
}

const isGyralHost = (node: Node): boolean => hostClasses.has(node.constructor);

/**
 * The number of Gyral host ancestors of `el` in the composed tree (across shadow roots): the
 * scheduler renders smaller depths first (view/04-scheduler.md "Marking").
 */
export function hostDepth(el: Element): number {
  let depth = 0;
  for (let node: Node | null = el.parentNode; node !== null;) {
    if (isGyralHost(node)) depth += 1;
    node = node instanceof ShadowRoot ? node.host : node.parentNode;
  }
  return depth;
}

/**
 * Does `node` belong to the component whose intent root is `root`? `root` is the component's
 * shadow root, or the host itself for light-DOM components (ADR 0014). The node must be in the
 * same tree (not inside a nested shadow root) with no other Gyral host between them: a nested
 * component, light-DOM or shadow, owns its own content. The nested host element itself (with
 * the parent's `data-intent` on it) still belongs to the parent.
 */
function ownedBy(node: Element, root: Node): boolean {
  const tree = root instanceof ShadowRoot ? root : root.getRootNode();
  if (node.getRootNode() !== tree) return false;
  for (let p = node.parentNode; p !== null; p = p.parentNode) {
    if (p === root) return true;
    if (isGyralHost(p)) return false;
  }
  return false;
}

/**
 * Finds the nearest `data-intent` element for this event that belongs to `root`. Elements
 * inside nested components are ignored: that is component isolation.
 */
export function findIntentElement(event: Event, root: Node): Element | undefined {
  for (const node of event.composedPath()) {
    if (node === root) return undefined;
    if (
      node instanceof Element &&
      node.hasAttribute('data-intent') &&
      triggerOf(node) === event.type &&
      ownedBy(node, root)
    ) {
      return node;
    }
  }
  return undefined;
}

function valueOf(el: Element): string | undefined {
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLButtonElement
  ) {
    return el.value;
  }
  return undefined;
}

/** Reads an event into an IntentInput. Form submissions are prevented and turned into FormData. */
export function readIntent(event: Event, root: Node): IntentInput | undefined {
  const target = findIntentElement(event, root);
  const name = target?.getAttribute('data-intent');
  if (target === undefined || name == null) return undefined;
  let formData: FormData | undefined;
  if (target instanceof HTMLFormElement && event instanceof SubmitEvent) {
    event.preventDefault();
    formData = new FormData(target, event.submitter);
  }
  return {
    name,
    event,
    target,
    value: valueOf(target),
    checked: isToggle(target) ? target.checked : undefined,
    formData,
    detail: event instanceof CustomEvent ? (event.detail as unknown) : undefined,
    key: event instanceof KeyboardEvent ? event.key : undefined,
    newState: toggleState(event),
    command: commandOf(event),
  };
}

// Any property read returns its own name, so `intents.Increment === 'Increment'`.
// Types restrict reads to real message tags; a tag without a parser warns at event time.
export const intentNames: unknown = new Proxy(
  {},
  { get: (_target, key) => (typeof key === 'string' ? key : undefined) },
);

/**
 * A component's intent names as a module-level constant, so pure list rows can name intents
 * without passing them through `pick` (view/03-lists.md "Rows must be pure"). The same object
 * the view gets as `i`:
 *
 *   const i = intents<Msg>();
 *   const Row = (t: Todo) => html`<input value=${t.id} data-intent=${i.Toggle} />`;
 */
export function intents<M extends Tagged>(): IntentNames<M> {
  return intentNames as IntentNames<M>;
}

/**
 * Adds capture listeners for `types` to a component root, skipping those in `listening`. A
 * root that listens for `command` in a browser without invoker commands loads the fallback
 * (invokers-shim.ts, ADR 0003 tier 3); settled() waits for it.
 */
export function listenForIntents(
  root: Node,
  listening: Set<string>,
  types: readonly string[],
  handler: (event: Event) => void,
): void {
  for (const type of types) {
    if (listening.has(type)) continue;
    listening.add(type);
    root.addEventListener(type, handler, { capture: true });
    if (type === 'command' && !invokersSupported()) loadInvokerShim(root);
  }
}

/** Parses one event with its matching parser and delivers the message (sync or async). */
export function handleIntent<M>(
  event: Event,
  root: Node,
  parsers: Readonly<Record<string, IntentParser<M> | undefined>>,
  tag: string,
  deliver: (msg: Tagged | undefined) => void,
): void {
  const input = readIntent(event, root);
  if (input === undefined) return;
  const parser = parsers[input.name];
  if (parser === undefined) {
    console.warn(`<${tag}> has no intent parser for data-intent="${input.name}".`);
    return;
  }
  const result = parser(input) as Tagged | undefined | Promise<Tagged | undefined>;
  if (result instanceof Promise) {
    result.then(deliver, (error: unknown) => {
      console.error(`<${tag}> intent parser for "${input.name}" failed`, error);
    });
  } else {
    deliver(result);
  }
}
