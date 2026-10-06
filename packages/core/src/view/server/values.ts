// Value rules for attribute and text-content holes on the server (view/02-bindings.md
// "Attribute values", "Live form state"; view/06-server.md "Writing a template result"),
// identical to the client's (render/attr-parts.ts) so both sides write the same attributes.
// And the server-only errors: a Promise anywhere (renders are synchronous), text the parser
// would move out of table structure, children given to a light-DOM component.
import { nothing } from '../render/values.js';
import { warnTrue, warnValue } from '../render/warn.js';

const SPEC = 'docs/design-docs/view';

export const absent = (v: unknown): boolean => v === null || v === undefined || v === nothing;
export const truthy = (v: unknown): boolean => v !== nothing && !!v;

const isObject = (v: unknown): v is object =>
  (typeof v === 'object' && v !== null) || typeof v === 'function';

/** `String(v)`: objects and functions as the client writes them (render/attr-parts.ts). */
const text = String as (value: unknown) => string;

const isThenable = (v: object): boolean =>
  typeof (v as { readonly then?: unknown }).then === 'function';

/** A Promise in any hole: server renders are synchronous (06 "API"). Always an error. */
export function checkPromise(v: object, where: string): void {
  if (!isThenable(v)) return;
  throw new TypeError(
    `gyral: ${where} got a Promise. Server renders are synchronous: state is known before ` +
      'rendering, so load the data first (in the route handler or a form action) and pass ' +
      `it as props (${SPEC}/06-server.md "API").`,
  );
}

/** `String(v)` for an attribute value, with the development warning for objects. */
function written(v: unknown, at: object, name: string, dev: boolean): string {
  if (typeof v === 'string') return v;
  if (isObject(v)) {
    checkPromise(v, `the attribute ${name}`);
    if (dev) warnValue(at, v, `the attribute ${name}`);
  }
  return text(v);
}

/** `name=${v}`: the value to write, or null to leave the attribute out. */
export function attrText(v: unknown, at: object, name: string, dev: boolean): string | null {
  return absent(v) ? null : written(v, at, name, dev);
}

/** `name="a ${x} b"`: pieces joined; `nothing` in any piece leaves the attribute out. */
export function multiText(
  values: readonly unknown[],
  from: number,
  strings: readonly string[],
  at: object,
  name: string,
  dev: boolean,
): string | null {
  let joined = strings[0] ?? '';
  for (let i = 1; i < strings.length; i++) {
    const v = values[from + i - 1];
    if (v === nothing) return null;
    joined +=
      (v === null || v === undefined ? '' : written(v, at, name, dev)) + (strings[i] as string);
  }
  return joined;
}

/** `<textarea>`/`<title>` content: child-hole rules flattened to a string, as on the client. */
export function textContent(v: unknown, at: object, dev: boolean): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (isObject(v)) {
    checkPromise(v, 'the text content');
    if (dev) warnValue(at, v, 'the text content');
    return text(v);
  }
  if (dev && v === true) warnTrue(at);
  return '';
}

/** Text written directly in table structure would be foster-parented (rule 7). */
export function fosterError(text: string, parent: string): never {
  throw new Error(
    `gyral: the text ${JSON.stringify(text.slice(0, 40))} is written directly inside ` +
      `<${parent}>. The HTML parser moves text out of table structure (foster parenting), so ` +
      'the page would differ from what the client renders. Put text inside a <td>, <th> or ' +
      `<caption> (${SPEC}/09-template-rules.md, rule 7).`,
  );
}

/** A light-DOM component owns its children (ADR 0014). */
export function lightChildrenError(tag: string): never {
  throw new Error(
    `gyral: <${tag}> renders in light DOM (shadow: false), so it owns its children, but its ` +
      'parent wrote children inside it. Pass the data as props instead, or make it a shadow ' +
      `component and use <slot> (${SPEC}/06-server.md "Components", ADR 0014).`,
  );
}

/** An attribute name from a hook's server half must not break the start tag. */
export function checkAttrName(name: string): void {
  if (/^[^\s"'>/=\0]+$/.test(name)) return;
  throw new TypeError(
    `gyral: an element hook's server half returned the attribute name ${JSON.stringify(name)}, ` +
      `which isn't a valid attribute name (${SPEC}/02-bindings.md "Element hooks").`,
  );
}
