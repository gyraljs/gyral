// Element parts (view/02-bindings.md "Attribute values", "Boolean attributes", "Properties",
// "Live form state", "Element hooks"): every hole on or inside one element that isn't a child
// hole, as one class with a kind, so an instance's update loop sees only two part shapes.
// Plain parts compare with their committed value and write only on change. Live form state
// sets the attribute too on first creation (the default, so `form.reset()` returns to the
// model's first value) and later compares with the element's live state. Constructors only
// record nodes, so hydration (07) can build the same parts over server DOM and set `value`.
import { DEV } from '#view-dev';
import { hookSpec, queueHook, sameArgs, type HookResult, type HookSpec } from './hooks.js';
import { nothing, UNSET } from './values.js';
import { badHook, warnTrue, warnValue } from './warn.js';

/** What every part of an instance implements: commit its value(s) from this render's values. */
export interface Part {
  set(values: readonly unknown[]): void;
}

/** `name=${v}`; `value=${v}` on a non-text input becomes this after its first commit. */
export const ATTR = 0;
/** `name="a ${x} b"`. */
export const MULTI = 1;
/** `?name=${v}`. */
export const BOOL = 2;
/** `.name=${v}`. */
export const PROP = 3;
/** `value=${v}` on `<input>`: live `.value`. */
export const VALUE = 4;
/** `?checked` on `<input>`, `?selected` on `<option>`: attribute first, then the live property. */
export const CHECKED = 5;
/** `?indeterminate` on `<input>`: the property only. */
export const STATE = 6;
/** `?open` on `<details>`/`<dialog>`: the attribute, compared with its live presence. */
export const OPEN = 7;
/** `<title>${v}</title>`: text content. */
export const TITLE = 8;
/** `<textarea>${v}</textarea>`: text content first, then the live `.value`. */
export const TEXTAREA = 9;
/** `${hook(…)}` in a start tag. */
export const HOOK = 10;

/** Input types whose `value` is a submitted value, not state the user edits. */
const PLAIN = /^(checkbox|radio|hidden|button|submit|reset|image|file)$/;

/** `String(v)`: numbers and booleans as text (objects warn in development first). */
const text = String as (value: unknown) => string;

export const absent = (v: unknown): boolean => v === null || v === undefined || v === nothing;
export const truthy = (v: unknown): boolean => v !== nothing && !!v;

const isObject = (v: unknown): boolean =>
  (typeof v === 'object' && v !== null) || typeof v === 'function';

/** The text of a `<textarea>`/`<title>` value: child-hole rules, as one string. */
export function textOf(part: object, v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (DEV) {
    if (v === true) warnTrue(part);
    else if (isObject(v)) warnValue(part, v, 'the text content');
  }
  return absent(v) || typeof v === 'boolean' ? '' : text(v);
}

/** The kind of a bound attribute (`?name` when `bool`) on `el`. */
export function attrKind(el: Element, name: string, bool: boolean): number {
  const tag = el.localName;
  if (!bool) return name === 'value' && tag === 'input' ? VALUE : ATTR;
  if (tag === 'input')
    return name === 'checked' ? CHECKED : name === 'indeterminate' ? STATE : BOOL;
  if (tag === 'option' && name === 'selected') return CHECKED;
  return name === 'open' && (tag === 'details' || tag === 'dialog') ? OPEN : BOOL;
}

export class AttrPart implements Part {
  readonly el: Element;
  kind: number;
  readonly name: string;
  readonly at: number;
  /** The committed value: raw (ATTR, PROP, VALUE), boolean, string (MULTI, text), or UNSET. */
  value: unknown;
  /** MULTI: the static strings and the committed pieces. */
  readonly strings: readonly string[] | undefined;
  readonly pieces: unknown[] | undefined;
  /** HOOK: the hook, its committed arguments and the ones before. */
  spec: HookSpec<readonly unknown[]> | null;
  args: readonly unknown[] | undefined;
  prev: readonly unknown[] | undefined;

  constructor(el: Element, kind: number, name: string, at: number, strings?: readonly string[]) {
    this.el = el;
    this.kind = kind;
    this.name = name;
    this.at = at;
    this.value = UNSET;
    this.strings = strings;
    this.pieces =
      strings === undefined ? undefined : new Array<unknown>(strings.length - 1).fill(UNSET);
    this.spec = null;
    this.args = undefined;
    this.prev = undefined;
  }

  set(values: readonly unknown[]): void {
    const v = values[this.at];
    const el = this.el;
    const live = el as unknown as Record<string, unknown>;
    switch (this.kind) {
      case ATTR:
        if (v === this.value) return;
        this.value = v;
        if (absent(v)) el.removeAttribute(this.name);
        else {
          if (DEV && isObject(v)) warnValue(this, v, `the attribute ${this.name}`);
          el.setAttribute(this.name, typeof v === 'string' ? v : text(v));
        }
        return;
      case MULTI:
        this.multi(values);
        return;
      case BOOL: {
        const on = truthy(v);
        if (on === this.value) return;
        this.value = on;
        el.toggleAttribute(this.name, on);
        return;
      }
      case PROP:
        if (Object.is(v, this.value)) return;
        this.value = v;
        live[this.name] = v;
        return;
      case VALUE: {
        const s = absent(v) ? '' : text(v);
        if (this.value === UNSET) {
          // First creation: the attribute (the default), then the live value.
          if (absent(v)) el.removeAttribute('value');
          else el.setAttribute('value', s);
          if (PLAIN.test((el as HTMLInputElement).type)) this.kind = ATTR;
        }
        this.value = v;
        if (this.kind === VALUE && live.value !== s) live.value = s;
        return;
      }
      case CHECKED:
      case STATE: {
        const on = truthy(v);
        if (this.kind === CHECKED && this.value === UNSET) el.toggleAttribute(this.name, on);
        this.value = on;
        if (live[this.name] !== on) live[this.name] = on;
        return;
      }
      case OPEN: {
        const on = truthy(v);
        this.value = on;
        if (el.hasAttribute('open') !== on) el.toggleAttribute('open', on);
        return;
      }
      case TITLE:
      case TEXTAREA: {
        const s = textOf(this, v);
        if (this.kind === TEXTAREA && this.value !== UNSET) {
          if (live.value !== s) live.value = s;
        } else if (s !== this.value) el.textContent = s;
        this.value = s;
        return;
      }
      default:
        this.hook(v);
    }
  }

  /** MULTI: pieces joined with the static strings; `nothing` in any piece removes. */
  private multi(values: readonly unknown[]): void {
    const pieces = this.pieces as unknown[];
    const strings = this.strings as readonly string[];
    let changed = false;
    for (let i = 0; i < pieces.length; i++) {
      const v = values[this.at + i];
      if (v !== pieces[i]) {
        pieces[i] = v;
        changed = true;
      }
    }
    if (!changed) return;
    let joined: string | null = strings[0] as string;
    for (let i = 0; i < pieces.length; i++) {
      const v = pieces[i];
      if (v === nothing) {
        joined = null;
        break;
      }
      if (DEV && isObject(v)) warnValue(this, v, `the attribute ${this.name}`);
      joined += (v === null || v === undefined ? '' : text(v)) + (strings[i + 1] as string);
    }
    if (joined === this.value) return;
    this.value = joined;
    if (joined === null) this.el.removeAttribute(this.name);
    else this.el.setAttribute(this.name, joined);
  }

  /** HOOK: queue the client call when the hook or its arguments changed. */
  private hook(v: unknown): void {
    if (absent(v)) {
      this.spec = null;
      this.args = undefined;
      return;
    }
    const spec = hookSpec(v);
    if (spec === undefined) {
      if (DEV) badHook(v);
      return;
    }
    const args = (v as HookResult).args;
    const same = spec === this.spec;
    if (same && sameArgs(args, this.args)) return;
    this.prev = same ? this.args : undefined;
    this.spec = spec;
    this.args = args;
    queueHook(this);
  }
}
