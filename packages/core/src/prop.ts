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
// construction: a prop without `required` or `default` includes `undefined`.
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { features } from './features.js';
import { propFeature } from './props.js';

declare const OUTPUT: unique symbol;

export type PropKind = 'string' | 'number' | 'boolean' | 'json' | 'value';

/** One declared prop: what a builder returns. */
export interface Prop<T> {
  readonly kind: PropKind;
  /** The attribute name, `false` for property only, `undefined` for the kebab-case default. */
  readonly attribute: string | false | undefined;
  /** Refines (string/number/boolean) or defines (json/value) the accepted values. */
  readonly schema: StandardSchemaV1 | undefined;
  /** A missing value is a bug: warned once per instance at first render. */
  readonly required: boolean;
  /** Used whenever the element's value is missing (`boolean` props default to `false`). */
  readonly default?: unknown;
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
type Out<S extends StandardSchemaV1> = StandardSchemaV1.InferOutput<S>;

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

interface WithSchema {
  <S extends StandardSchemaV1>(
    schema: S,
    opts: Common & (Required | Defaulted<NoInfer<Out<S>>>),
  ): Prop<Out<S>>;
  <S extends StandardSchemaV1>(schema: S, opts?: Common & Optional): Prop<Out<S> | undefined>;
}

interface Options {
  readonly attribute?: string | false;
  readonly schema?: StandardSchemaV1;
  readonly required?: boolean;
  readonly default?: unknown;
}

function make(kind: PropKind, opts: Options = {}, schema?: StandardSchemaV1): Prop<unknown> {
  features.props = propFeature; // components can declare props now (features.ts)
  const value = opts.default !== undefined ? opts.default : kind === 'boolean' ? false : undefined;
  const base = {
    kind,
    attribute: kind === 'value' ? false : opts.attribute,
    schema: schema ?? opts.schema,
    required: opts.required === true,
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
  /** Attribute parsed with `JSON.parse`, then the schema. */
  readonly json: WithSchema;
  /** Property only: no attribute. Validated in development. */
  readonly value: WithSchema;
} = {
  string: (opts?: Options) => make('string', opts),
  number: (opts?: Options) => make('number', opts),
  boolean: ((opts?: Options) => make('boolean', opts)) as <O extends boolean>() => Prop<O>,
  json: (schema: StandardSchemaV1, opts?: Options) => make('json', opts, schema),
  value: (schema: StandardSchemaV1, opts?: Options) => make('value', opts, schema),
};
