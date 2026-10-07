// Development-only errors and warnings of the renderer (view/02-bindings.md "Child values",
// view/03-lists.md "Keys", view/09-template-rules.md "Warnings"). Every call site is guarded by
// `if (DEV)`, so production bundles drop this module. Messages say what to write instead.

const SPEC = 'docs/design-docs/view';
const warned = new WeakSet<object>();

const describe = (value: unknown): string =>
  typeof value === 'function'
    ? 'a function'
    : Array.isArray(value)
      ? 'an array'
      : typeof value === 'object'
        ? `an object (${Object.prototype.toString.call(value).slice(8, -1)})`
        : `a ${typeof value}`;

/** A child hole got a value it can't render: an error in development. */
export function badChild(value: unknown): never {
  throw new TypeError(
    `gyral: a child hole got ${describe(value)}, which it can't render. Child holes take ` +
      `text, numbers, html\`…\` results, each(…), arrays, raw(…), or null/undefined/false/` +
      `nothing for nothing. Format the value as text, or render it with a template ` +
      `(${SPEC}/02-bindings.md "Child values").`,
  );
}

/** `true` in a child hole, once per part: usually a `cond && x` slip. */
export function warnTrue(part: object): void {
  if (warned.has(part)) return;
  warned.add(part);
  console.warn(
    'gyral: `true` in a child hole renders nothing. It is usually a `cond && x` slip where ' +
      'cond is a boolean and x is missing; write `cond ? x : nothing` ' +
      `(${SPEC}/02-bindings.md "Child values").`,
  );
}

/** An attribute or text-content hole got an object or function, once per part. */
export function warnValue(part: object, value: unknown, where: string): void {
  if (warned.has(part)) return;
  warned.add(part);
  console.warn(
    `gyral: ${where} got ${describe(value)}; it is written as String(value). Pass a string, ` +
      `number or boolean, or null/undefined/nothing to leave it out ` +
      `(${SPEC}/02-bindings.md "Attribute values").`,
  );
}

let rawWarned = false;

/** `raw()` parsed in the browser, once per page. */
export function warnRaw(): void {
  if (rawWarned) return;
  rawWarned = true;
  console.warn(
    'gyral: raw() rendered in the browser. It works, but every change re-parses the markup; ' +
      'prefer templates for content that changes, and keep raw() for server-rendered markup ' +
      `(${SPEC}/09-template-rules.md "Warnings").`,
  );
}

/** Keys must be unique strings or numbers: an error in development. */
export function badKey(key: unknown, index: number, duplicate: boolean): never {
  const problem = duplicate
    ? `the key ${JSON.stringify(key)} appears twice (again at index ${String(index)})`
    : `the key at index ${String(index)} is ${describe(key)}`;
  throw new Error(
    `gyral: each(): ${problem}. Keys must be unique strings or numbers within a list, such ` +
      `as a stable id: each(items, (x) => x.id, Row) (${SPEC}/03-lists.md "Keys").`,
  );
}

/** A skipped row would render differently: it reads something besides `item` and `pick`. */
export function warnImpureRow(row: (...args: never[]) => unknown): void {
  const name = row.name === '' ? 'a row function' : `the row function ${row.name}`;
  console.warn(
    `gyral: each(): ${name} depends on something not passed through \`item\` or \`pick\`, so ` +
      'skipped rows would show stale content. Return what it reads from `pick` and take it as ' +
      `the second argument (${SPEC}/03-lists.md "Rows must be pure").`,
  );
}

/** A hook hole got something other than a hook result. */
export function badHook(value: unknown): never {
  throw new TypeError(
    `gyral: an element hook position (\${…} inside a start tag) got ${describe(value)}. Only ` +
      `hooks made with defineHook() go there, e.g. <input \${invalid(errors)}> ` +
      `(${SPEC}/02-bindings.md "Element hooks").`,
  );
}
