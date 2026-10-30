// `on(event, [filter], parser)` (gyral-337.6, ADR 0001 addendum "Typed intent input"): an intent
// parser for one event type, whose input is typed by that event and carries what parsers kept
// reaching for themselves: the control and its form, modifier keys, files, a numeric value and
// the element the event started on inside shadow roots. A key filter declines other keys. A
// module of its own: apps that never call it don't bundle it. @gyral/testing's parse() runs these
// parsers in Node too (gyral-cd0): DOM classes are feature-detected, and a test input may have no
// target, an event without composedPath() and its key in `key` alone.
import type { IntentInput, IntentParser, ParserCtx, ParseResult } from './types.js';
import { DEV, message } from './view/index.js';

/** Modifier keys held during a keyboard, mouse, pointer, wheel or touch event. */
export interface Modifiers {
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

/** A form control that can carry an intent. */
export type IntentControl =
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement;

/** What an `on()` parser gets: the intent input, typed by its event, and more. */
export interface EventIntentInput<E extends Event> extends Omit<IntentInput, 'event'> {
  readonly event: E;
  /** The `input`, `select`, `textarea` or `button` carrying the intent. */
  readonly control: IntentControl | undefined;
  /** That control's form, or the `<form>` carrying the intent. */
  readonly form: HTMLFormElement | undefined;
  /** Modifier keys held; all `false` for events without them. */
  readonly modifiers: Modifiers;
  /** Files from a file input, a drop or a paste; `undefined` for other events. */
  readonly files: readonly File[] | undefined;
  /** A number, range, date or time input's value as a number; `undefined` when empty or invalid. */
  readonly valueAsNumber: number | undefined;
  /** The innermost element the event started on (`composedPath()[0]`), inside shadow roots too. */
  readonly origin: Element | undefined;
}

/**
 * Which keyboard events a parser handles: `keys` (`KeyboardEvent.key` values) and `modifiers`:
 * `'none'` (no modifier held, so Ctrl+R still reloads), `'any'` (one at least), or the ones that
 * must be held or not (`{ ctrl: true }`). Others are declined like `undefined`: they pass outward
 * and keep their default action.
 */
export interface KeyFilter {
  readonly keys?: readonly string[];
  readonly modifiers?: 'none' | 'any' | Partial<Modifiers>;
}

type Parse<K extends keyof HTMLElementEventMap, M, P, S> = (
  input: EventIntentInput<HTMLElementEventMap[K]>,
  ctx: ParserCtx<P, S>,
) => ParseResult<M> | Promise<ParseResult<M>>;

const NUMERIC = /^(number|range|date|time|datetime-local|month|week)$/;
const CONTROL = /^(INPUT|SELECT|TEXTAREA|BUTTON)$/;

/** Marks an `on()` parser with its event type, so @gyral/testing's parse() can create one. */
export const ON_EVENT: unique symbol = Symbol();

/** An `<input>`, feature-detected: Node has no DOM classes, and parse() tests run there. */
const isInput = (control: unknown): control is HTMLInputElement =>
  typeof HTMLInputElement === 'function' && control instanceof HTMLInputElement;

function modifiersOf(event: Event): Modifiers {
  const e = event as Partial<Record<'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey', boolean>>;
  return {
    shift: e.shiftKey === true,
    ctrl: e.ctrlKey === true,
    alt: e.altKey === true,
    meta: e.metaKey === true,
  };
}

function filesOf(event: Event, control: IntentControl | undefined): readonly File[] | undefined {
  if (isInput(control) && control.type === 'file') return [...(control.files ?? [])];
  const data =
    (event as Partial<DragEvent>).dataTransfer ?? (event as Partial<ClipboardEvent>).clipboardData;
  return data === undefined ? undefined : [...(data?.files ?? [])];
}

function passes(filter: KeyFilter, input: IntentInput, held: Modifiers): boolean {
  const { keys, modifiers } = filter;
  // The intent layer copies `event.key` into `key`; a test input may give `key` alone.
  const key = input.key ?? (input.event as Partial<KeyboardEvent>).key ?? '';
  if (keys !== undefined && !keys.includes(key)) return false;
  const any = held.shift || held.ctrl || held.alt || held.meta;
  if (modifiers === 'none') return !any;
  if (modifiers === 'any') return any;
  return Object.entries(modifiers ?? {}).every(([k, v]) => held[k as keyof Modifiers] === v);
}

/** The input an `on()` parser gets, from the intent input of its event. */
function eventInput<E extends Event>(input: IntentInput, held: Modifiers): EventIntentInput<E> {
  const { event, value } = input;
  // Always an element in the browser; a parse() test may leave it out.
  const target = input.target as Element | undefined;
  const control = CONTROL.test(target?.tagName ?? '') ? (target as IntentControl) : undefined;
  const number =
    isInput(control) && NUMERIC.test(control.type)
      ? control.valueAsNumber
      : // No target: a parse() test, which gives the value alone.
        target === undefined && value
        ? Number(value)
        : NaN;
  const origin = (event as Partial<Event>).composedPath?.()[0];
  return {
    ...input,
    event: event as E,
    control,
    form:
      typeof HTMLFormElement === 'function' && target instanceof HTMLFormElement
        ? target
        : (control?.form ?? undefined),
    modifiers: held,
    files: filesOf(event, control),
    valueAsNumber: Number.isNaN(number) ? undefined : number,
    origin: typeof Element === 'function' && origin instanceof Element ? origin : undefined,
  };
}

/**
 * An intent parser for `type` events, its input typed by the event (`keydown` gives a
 * `KeyboardEvent`):
 *
 *   intent: {
 *     Move: on('keydown', { keys: ['ArrowLeft', 'ArrowRight'], modifiers: 'none' }, (input) =>
 *       ({ _tag: 'Move', by: input.key === 'ArrowLeft' ? -1 : 1 })),
 *   }
 *
 * Bind the intent to that event (`data-intent-keydown=${i.Move}`); development throws G0018 when
 * another event reaches it.
 */
export function on<K extends keyof HTMLElementEventMap, M, P = unknown, S = unknown>(
  type: K,
  parse: Parse<K, M, P, S>,
): IntentParser<M, P, S>;
export function on<K extends keyof HTMLElementEventMap, M, P = unknown, S = unknown>(
  type: K,
  filter: KeyFilter,
  parse: Parse<K, M, P, S>,
): IntentParser<M, P, S>;
export function on<K extends keyof HTMLElementEventMap, M, P, S>(
  type: K,
  filterOrParse: KeyFilter | Parse<K, M, P, S>,
  maybeParse?: Parse<K, M, P, S>,
): IntentParser<M, P, S> {
  const filter = typeof filterOrParse === 'function' ? {} : filterOrParse;
  const parse = (typeof filterOrParse === 'function' ? filterOrParse : maybeParse) as Parse<
    K,
    M,
    P,
    S
  >;
  const parser: IntentParser<M, P, S> & { [ON_EVENT]?: K } = (input, ctx) => {
    if (input.event.type !== type) {
      if (DEV) throw new Error(message(18, input.name, type, input.event.type));
      return undefined;
    }
    const held = modifiersOf(input.event);
    if (!passes(filter, input, held)) return undefined;
    return parse(eventInput<HTMLElementEventMap[K]>(input, held), ctx);
  };
  parser[ON_EVENT] = type;
  return parser;
}
