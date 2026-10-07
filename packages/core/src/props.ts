// Prop bookkeeping for define() (view/05-element.md "Props", ADR 0007): attribute names and
// parsing, validation through Standard Schema, defaults, change detection, seed restore. The
// prop builders register `propFeature` (features.ts): components without props don't bundle it.
import type { Prop } from './prop.js';
import { DEV } from './view/index.js';

type Bag = Readonly<Record<string, unknown>>;

export type PropTable = Readonly<Record<string, Prop<unknown>>>;

/** `minPrice` → `min-price`. */
export const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** The prop's attribute, or undefined for a property-only prop. */
export function attributeOf(name: string, def: Prop<unknown>): string | undefined {
  if (def.attribute === false) return undefined;
  return def.attribute ?? kebab(name);
}

export type Checked =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly issues: readonly string[] };

const builtIn: Readonly<Record<string, (v: unknown) => boolean>> = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && !Number.isNaN(v),
  boolean: (v) => typeof v === 'boolean',
};

/** Runs the built-in type check and the prop's schema. Schemas must be synchronous. */
export function checkValue(tag: string, name: string, def: Prop<unknown>, value: unknown): Checked {
  const typeOk = builtIn[def.kind];
  if (typeOk !== undefined && !typeOk(value)) {
    return {
      ok: false,
      issues: [`expected a ${def.kind}, got ${typeof value}`],
    };
  }
  const schema = def.schema;
  if (schema === undefined) return { ok: true, value };
  // A type guard (prop.value/prop.json, gyral-c5d.7); ArkType-style callable schemas have ~standard.
  if (!('~standard' in schema)) {
    return schema(value) ? { ok: true, value } : { ok: false, issues: [`failed ${schema.name}`] };
  }
  const result = schema['~standard'].validate(value);
  if (result instanceof Promise) {
    throw new TypeError(
      `<${tag}> prop "${name}" has an asynchronous schema; it must be synchronous.`,
    );
  }
  if (result.issues !== undefined)
    return { ok: false, issues: result.issues.map((i) => i.message) };
  return { ok: true, value: result.value };
}

/** Parses an attribute value (`null`: absent) per the builder table; undefined means missing. */
export function parseAttribute(def: Prop<unknown>, raw: string | null): Checked | undefined {
  if (def.kind === 'boolean') return { ok: true, value: raw !== null };
  if (raw === null) return undefined;
  if (def.kind === 'number') {
    const n = raw.trim() === '' ? Number.NaN : Number(raw);
    return Number.isNaN(n)
      ? { ok: false, issues: [`"${raw}" is not a number`] }
      : { ok: true, value: n };
  }
  if (def.kind === 'json') {
    try {
      return { ok: true, value: JSON.parse(raw) as unknown };
    } catch {
      return { ok: false, issues: ['the attribute is not valid JSON'] };
    }
  }
  return { ok: true, value: raw };
}

/** Logs an invalid value; the caller then treats the prop as missing. */
export function reportInvalid(tag: string, name: string, from: string, issues: readonly string[]) {
  console.error(
    `<${tag}> prop "${name}" got an invalid value from ${from}, so it is treated as missing: ` +
      issues.join('; '),
  );
}

/**
 * An attribute's value for prop `name` (view/05-element.md "When props are validated"):
 * parsed per the builder and always validated; invalid or absent values are missing.
 */
export function attributeValue(
  tag: string,
  name: string,
  def: Prop<unknown> | undefined,
  attr: string,
  raw: string | null,
): unknown {
  const parsed = def === undefined ? undefined : parseAttribute(def, raw);
  if (def === undefined || parsed === undefined) return undefined;
  const checked = parsed.ok ? checkValue(tag, name, def, parsed.value) : parsed;
  if (checked.ok) return checked.value;
  reportInvalid(tag, name, `the attribute ${attr}`, checked.issues);
  return undefined;
}

/**
 * A property set's (or seed's) value for prop `name`: validated in development only, where an
 * invalid value is missing and a schema that transforms warns (production keeps the input).
 */
export function propertyValue(
  tag: string,
  name: string,
  def: Prop<unknown> | undefined,
  value: unknown,
  from = 'a property',
): unknown {
  if (!DEV || value === undefined || def === undefined) return value;
  const checked = checkValue(tag, name, def, value);
  if (!checked.ok) {
    reportInvalid(tag, name, from, checked.issues);
    return undefined;
  }
  if (!sameData(checked.value, value)) {
    console.warn(
      `<${tag}> prop "${name}": its schema transformed the value from ${from}. Production ` +
        "doesn't run schemas on property sets; validate, don't transform.",
    );
  }
  return value;
}

/** Structural equality for plain data (arrays, plain objects), `Object.is` for the rest. */
export function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((x, i) => sameData(x, b[i]));
  }
  if (
    Object.getPrototypeOf(a) !== Object.prototype ||
    Object.getPrototypeOf(b) !== Object.prototype
  ) {
    return false;
  }
  const ka = Object.keys(a);
  return (
    ka.length === Object.keys(b).length && ka.every((k) => sameData((a as Bag)[k], (b as Bag)[k]))
  );
}

/** The declared props as components see them: `default` fills missing values. */
export function readProps(values: Bag, table: PropTable): Bag {
  const out: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(table)) {
    const value = values[name];
    out[name] = value === undefined ? def.default : value;
  }
  return out;
}

/** Required props that are still missing (ADR 0007 addendum). */
export function missingRequired(values: Bag, table: PropTable): string[] {
  return Object.keys(table).filter(
    (name) => table[name]?.required === true && values[name] === undefined,
  );
}

/** Warns about required props that are still missing, at first render. */
export function warnMissing(tag: string, values: Bag, table: PropTable): void {
  const missing = missingRequired(values, table);
  if (missing.length > 0) {
    console.warn(`<${tag}> is missing required prop(s): ${missing.join(', ')}.`);
  }
}

/**
 * Declared props that collide with a built-in element property (`hidden`, `title`, `id`, …):
 * the accessor replaces the built-in, so setting the prop silently changes what the platform
 * does with it (gyral-czi.33).
 */
export function shadowedBuiltins(names: readonly string[]): string[] {
  if (typeof HTMLElement === 'undefined') return [];
  return names.filter((name) => name in HTMLElement.prototype);
}

/** define(): a prop named like a built-in property is an error in development, else a warning. */
export function checkShadowed(tag: string, names: readonly string[]): void {
  const shadowed = shadowedBuiltins(names);
  if (shadowed.length === 0) return;
  const message =
    `<${tag}> declares prop(s) that shadow built-in element properties: ` +
    `${shadowed.join(', ')}. Setting them changes platform behaviour ` +
    `(a prop named "hidden" hides the element). Rename them (view/05-element.md).`;
  if (DEV) throw new TypeError(message);
  console.warn(message);
}

/** What the element uses, registered by the prop builders (features.ts). */
export const propFeature = {
  attributeOf,
  attributeValue,
  propertyValue,
  warnMissing,
  readProps,
  checkShadowed,
};

export type PropFeature = typeof propFeature;
