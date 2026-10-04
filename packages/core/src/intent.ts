import type { IntentInput } from './types.js';

/** Event a child component dispatches on its host to send an output up (ADR 0010). */
export const OUTPUT_EVENT = 'gyral-output';

/** Events the intent layer listens for on each component's shadow root. */
export const INTENT_EVENTS = ['click', 'submit', 'input', 'change', OUTPUT_EVENT] as const;

const isToggle = (el: Element): el is HTMLInputElement =>
  el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');

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

/**
 * Finds the nearest `data-intent` element for this event that belongs to `root`.
 * Elements inside nested shadow roots are ignored: that is component isolation.
 */
export function findIntentElement(event: Event, root: Node): Element | undefined {
  for (const node of event.composedPath()) {
    if (node === root) return undefined;
    if (
      node instanceof Element &&
      node.getRootNode() === root &&
      node.hasAttribute('data-intent') &&
      triggerOf(node) === event.type
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
  };
}
