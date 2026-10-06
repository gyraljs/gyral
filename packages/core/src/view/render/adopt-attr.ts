// Element parts in hydration (view/07-hydration.md "The parallel walk", "Form state"): an
// attribute, property, hook or text part built over server DOM takes this render's values as
// committed. Lives with the walk, in the lazily loaded hydration code, not in attr-parts.ts.
import {
  absent,
  ATTR,
  BOOL,
  CHECKED,
  HOOK,
  MULTI,
  OPEN,
  PLAIN,
  PROP,
  STATE,
  TEXTAREA,
  textOf,
  TITLE,
  truthy,
  VALUE,
  type AttrPart,
} from './attr-parts.js';

/** Kinds whose adopted value is held until the model changes it (form state the user edits). */
const HELD = (1 << VALUE) | (1 << CHECKED) | (1 << OPEN) | (1 << TEXTAREA);

/**
 * Takes this render's values as committed without writing (the server wrote them). Form state
 * the user can change is held (07 "Form state"); `?indeterminate`, which no attribute carries,
 * is set; a property is set unless a nested component already has it from its own seed.
 */
export function adoptAttr(part: AttrPart, values: readonly unknown[]): void {
  const v = values[part.at];
  const el = part.el;
  const live = el as unknown as Record<string, unknown>;
  const name = part.name;
  const kind = part.kind;
  if (kind === HOOK) part.hook(v);
  else if (kind === PROP) {
    part.value = v;
    const own = live[name] !== undefined && el.localName.includes('-');
    if (!own && !Object.is(live[name], v)) live[name] = v;
  } else if (kind === MULTI) {
    const pieces = part.pieces as unknown[];
    for (let i = 0; i < pieces.length; i++) pieces[i] = values[part.at + i];
    part.value = part.join(pieces);
  } else if (kind === ATTR || kind === VALUE) {
    part.value = v;
    if (kind === VALUE && PLAIN.test((el as HTMLInputElement).type)) part.kind = ATTR;
  } else if (kind === TITLE || kind === TEXTAREA) part.value = textOf(part, v);
  else {
    part.value = truthy(v);
    if (kind === STATE && live[name] !== part.value) live[name] = part.value;
  }
  part.held = ((HELD >> part.kind) & 1) === 1;
}

/**
 * Development: the element shows what `part` adopted. Form state the user edits is compared
 * by its attribute or default text, which edits don't change; `?open` isn't compared. `fail`
 * throws the walk's mismatch.
 */
export function checkAttr(
  part: AttrPart,
  fail: (expected: string, found: string, at: Node) => never,
): void {
  const { el, name, value } = part;
  let want: unknown = value;
  let got: unknown;
  switch (part.kind) {
    case ATTR:
    case VALUE:
    case MULTI:
      if (part.kind !== MULTI) want = absent(value) ? null : String(value);
      got = el.getAttribute(name);
      break;
    case BOOL:
    case CHECKED:
      got = el.hasAttribute(name);
      break;
    case TITLE:
    case TEXTAREA:
      got = el.textContent;
      break;
    default:
      return;
  }
  if (got !== want) {
    const what = name === '' ? 'content' : name;
    fail(`${what} ${JSON.stringify(want)}`, `${JSON.stringify(got)} on <${el.localName}>`, el);
  }
}
