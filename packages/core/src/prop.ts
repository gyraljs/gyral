// Prop builders (docs/design-docs/view/05-element.md "Props"): every component input is
// declared with a builder over Standard Schema, so "parse at boundaries" covers attributes.
//
//   props: {
//     label: prop.string({ required: true }),        // attribute "label"
//     minPrice: prop.number({ default: 0 }),         // attribute "min-price"
//     items: prop.value(v.array(Item), { default: [] }), // property only
//   }
//
// A prop's type is inferred from its schema's output. The honesty rule (ADR 0007) holds by
// construction: a prop without `required` or `default` includes `undefined`. `prop.value` and
// `prop.json` also take a plain type guard (`(u: unknown) => u is T`) instead of a schema.
// Schemas and guards check; they don't decode: a property set keeps the object it was given.
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { features } from './features.js';
import { propFeature } from './props.js';
import { DEV } from '#view-dev';

declare const OUTPUT: unique symbol;

export type PropKind = 'string' | 'number' | 'boolean' | 'json' | 'value';

/** One declared prop: what a builder returns. */
export interface Prop<T> {
  readonly kind: PropKind;
  /** The attribute name, `false` for property only, `undefined` for the kebab-case default. */
  readonly attribute: string | false | undefined;
  /**
   * Refines (string/number/boolean) or defines (json/value) the accepted values: a Standard
   * Schema, or for json/value a type guard (props.ts `checkValue` tells them apart).
   */
  readonly schema: StandardSchemaV1 | PropGuard<unknown> | undefined;
  /** A missing value is a bug: warned once per instance at first render. */
  readonly required: boolean;
  /** Used whenever the element's value is missing (`boolean` props default to `false`). */
  readonly default?: unknown;
  /**
   * When a new value counts as unchanged (no re-render, no `PropsChanged`): `Object.is`, the
   * same JSON for `prop.json`, or the `equals` option of `prop.json`/`prop.value`.
   */
  readonly equals: (a: unknown, b: unknown) => boolean;
  /** Type-only: the value components see. Never set. */
  readonly [OUTPUT]?: () => T;
}

/** The props type of a table of builders: `PropsOf<typeof props>`. */
export type PropsOf<T extends Readonly<Record<string, Prop<unknown>>>> = {
  readonly [K in keyof T]: T[K] extends Prop<infer V> ? V : never;
};

interface Common {
  /** Attribute name, or `false` for property only. Default: kebab-case of the prop name. */
  readonly attribute?: string | false;
}

type Schema<O> = StandardSchemaV1<unknown, O>;

/** A plain type guard, accepted by `prop.value` and `prop.json` in place of a schema. */
export type PropGuard<T> = (value: unknown) => value is T;

/** What `prop.value` and `prop.json` accept: a Standard Schema or a type guard. */
type Check = StandardSchemaV1 | PropGuard<unknown>;
type Out<S extends Check> = S extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<S>
  : S extends (value: unknown) => value is infer T
    ? T
    : never;

interface Required {
  readonly required: true;
  readonly default?: undefined;
}
interface Defaulted<T> {
  readonly required?: false;
  readonly default: T;
}
interface Optional {
  readonly required?: false;
  readonly default?: undefined;
}

type Refined<O> = Common & { readonly schema?: Schema<O> };

interface Scalar<B> {
  <O extends B = B>(opts: Refined<O> & (Required | Defaulted<NoInfer<O>>)): Prop<O>;
  <O extends B = B>(opts?: Refined<O> & Optional): Prop<O | undefined>;
}

/** `equals` for `prop.json`/`prop.value`: the old and new value (`undefined` when unset). */
interface Equals<T> {
  readonly equals?: (a: T | undefined, b: T | undefined) => boolean;
}

interface WithSchema {
  <S extends Check>(
    schema: S,
    opts: Common & Equals<NoInfer<Out<S>>> & (Required | Defaulted<NoInfer<Out<S>>>),
  ): Prop<Out<S>>;
  <S extends Check>(
    schema: S,
    opts?: Common & Equals<NoInfer<Out<S>>> & Optional,
  ): Prop<Out<S> | undefined>;
}

interface Options {
  readonly attribute?: string | false;
  readonly schema?: StandardSchemaV1;
  readonly required?: boolean;
  readonly default?: unknown;
  readonly equals?: (a: unknown, b: unknown) => boolean;
}

/** `prop.json` values are JSON: the same JSON text is the same value. */
// `prop.json`'s default `equals`: the same JSON text. A value JSON can't encode (a cycle, a
// BigInt) is never equal, so the write always lands instead of throwing from the setter.
let warned = false;
function sameJson(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (error) {
    if (DEV && !warned) {
      warned = true;
      console.warn(
        `prop.json got a value JSON can't encode (${String(error)}); every write of it counts ` +
          'as a change. Use prop.value for non-JSON values, or pass equals.',
      );
    }
    return false;
  }
}

function make(kind: PropKind, opts: Options = {}, schema?: Check): Prop<unknown> {
  features.props = propFeature; // components can declare props now (features.ts)
  const value = opts.default !== undefined ? opts.default : kind === 'boolean' ? false : undefined;
  const base = {
    kind,
    attribute: kind === 'value' ? false : opts.attribute,
    schema: schema ?? opts.schema,
    required: opts.required === true,
    equals: opts.equals ?? (kind === 'json' ? sameJson : Object.is),
  };
  return value === undefined ? base : { ...base, default: value };
}

/** The prop builders. */
export const prop: {
  /** Attribute parsed as is. */
  readonly string: Scalar<string>;
  /** Attribute parsed with `Number(v)`; empty or `NaN` is invalid. */
  readonly number: Scalar<number>;
  /** Attribute present → `true`, absent → `false` (the default). */
  readonly boolean: <O extends boolean = boolean>(
    opts?: Refined<O> & { readonly default?: NoInfer<O> },
  ) => Prop<O>;
  /**
   * Attribute parsed with `JSON.parse`, then the schema (or type guard). Compared by value: a
   * new but equal object (a fresh `.prop=${{…}}` each render) changes nothing.
   */
  readonly json: WithSchema;
  /**
   * Property only: no attribute. Validated in development by the schema (or type guard), and
   * the object set is kept as is (production skips the check). Compared with `Object.is`
   * unless `equals` is given.
   */
  readonly value: WithSchema;
} = {
  string: (opts?: Options) => make('string', opts),
  number: (opts?: Options) => make('number', opts),
  boolean: ((opts?: Options) => make('boolean', opts)) as <O extends boolean>() => Prop<O>,
  json: (schema: Check, opts?: Options) => make('json', opts, schema),
  value: (schema: Check, opts?: Options) => make('value', opts, schema),
};
