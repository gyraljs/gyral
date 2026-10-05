import { commandOf, shimInvokers } from './invokers.js';
import type { IntentInput, IntentParser, Tagged } from './types.js';

/** Event a child component dispatches on its host to send an output up (ADR 0010). */
export const OUTPUT_EVENT = 'gyral-output';

/**
 * Events the intent layer listens for on each component's shadow root (capture phase, so
 * non-bubbling events such as `toggle` are seen too). Only `click`, `submit`, `input`,
 * `change` and outputs are default triggers; the rest fire via `data-intent-on="…"`.
 * Components may add more with `spec.events`.
 */
export const INTENT_EVENTS = [
  'click',
  'submit',
  'input',
  'change',
  'keydown',
  'keyup',
  'focusin',
  'focusout',
  'toggle',
  'command',
  OUTPUT_EVENT,
] as const;

const isToggle = (el: Element): el is HTMLInputElement =>
  el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');

// ToggleEvent (popover, <details>) is not Baseline widely available; read it structurally.
function toggleState(event: Event): 'open' | 'closed' | undefined {
  if (event.type !== 'toggle' || !('newState' in event)) return undefined;
  return event.newState === 'open' ? 'open' : 'closed';
}

const CLICK_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'image']);

/** The event that fires an intent unless `data-intent-on` overrides it. */
export function defaultTrigger(el: Element): string {
  if (el instanceof HTMLFormElement) return 'submit';
  if (el instanceof HTMLSelectElement) return 'change';
  if (el instanceof HTMLTextAreaElement) return 'input';
  if (el instanceof HTMLInputElement) {
    if (CLICK_INPUT_TYPES.has(el.type)) return 'click';
    return el.type === 'checkbox' || el.type === 'radio' ? 'change' : 'input';
  }
  // Custom elements (autonomous: the name has a dash) talk to their parent via outputs.
  if (el.localName.includes('-')) return OUTPUT_EVENT;
  return 'click';
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

/** Listens for intent events on a component root (capture phase: `toggle` doesn't bubble). */
export function listenForIntents(
  root: Node,
  extra: readonly string[],
  handler: (event: Event) => void,
): void {
  for (const type of new Set([...INTENT_EVENTS, ...extra])) {
    root.addEventListener(type, handler, { capture: true });
  }
  shimInvokers(root); // `command` intents in browsers without invoker commands
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
