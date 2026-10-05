// Property-test arbitraries from schemas (gyral-czi.11). An optional entry point:
// `@gyral/testing/arbitraries` needs `fast-check` installed; the main entry does not.
//
// Library-neutral: schemas become JSON Schema (Standard JSON Schema when the library
// implements it, e.g. Zod 4; otherwise a converter you pass, e.g. Valibot's), and JSON Schema
// becomes a fast-check arbitrary. Values are then filtered through the schema itself, so
// constraints JSON Schema can't express (refinements) still hold.
import fc from 'fast-check';
import type { StandardSchemaV1 } from '@standard-schema/spec';

/** The subset of JSON Schema (draft 2020-12) this generator understands. */
export interface JsonSchema {
  readonly type?: string | readonly string[];
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly format?: string;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly exclusiveMaximum?: number;
  readonly items?: JsonSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly anyOf?: readonly JsonSchema[];
  readonly oneOf?: readonly JsonSchema[];
  readonly $ref?: string;
  readonly $defs?: Readonly<Record<string, JsonSchema>>;
  readonly definitions?: Readonly<Record<string, JsonSchema>>;
}

/** Standard JSON Schema (implemented by Zod 4 and others) on a Standard Schema. */
interface StandardJsonSchema {
  readonly input: (options: { readonly target: string }) => unknown;
  readonly output: (options: { readonly target: string }) => unknown;
}

export interface ArbitraryOptions {
  /** Converts the schema to JSON Schema when the library lacks Standard JSON Schema. */
  readonly toJsonSchema?: (schema: StandardSchemaV1) => unknown;
  /** Generate the schema's input side (default; what a parser receives) or its output side. */
  readonly side?: 'input' | 'output';
  /** Drop generated values the schema rejects (sync validators only). Default `true`. */
  readonly validOnly?: boolean;
}

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function unsupported(what: string): never {
  throw new Error(
    `arbitraryFromJsonSchema: unsupported ${what}. Narrow the schema, or build this part ` +
      `with fast-check directly and combine it (fc.record, fc.oneof).`,
  );
}

function stringArb(s: JsonSchema): fc.Arbitrary<string> {
  const min = s.minLength ?? 0;
  const max = s.maxLength ?? Math.max(min, 20);
  const length = (v: string): boolean => v.length >= min && v.length <= max;
  switch (s.format) {
    case 'email':
      return fc.emailAddress().filter(length);
    case 'uuid':
      return fc.uuid();
    case 'date-time':
      return fc.date({ noInvalidDate: true }).map((d) => d.toISOString());
    case 'date':
      return fc.date({ noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10));
    case 'uri':
    case 'url':
      return fc.webUrl().filter(length);
    default:
      break;
  }
  if (s.pattern !== undefined) return fc.stringMatching(new RegExp(s.pattern)).filter(length);
  return fc.string({ minLength: min, maxLength: max });
}

function numberArb(s: JsonSchema, integer: boolean): fc.Arbitrary<number> {
  const low = s.exclusiveMinimum ?? s.minimum;
  const high = s.exclusiveMaximum ?? s.maximum;
  if (integer) {
    const min = Math.max(
      -MAX_SAFE,
      Math.ceil(low ?? -1e6) + (s.exclusiveMinimum === undefined ? 0 : 1),
    );
    const max = Math.min(
      MAX_SAFE,
      Math.floor(high ?? 1e6) - (s.exclusiveMaximum === undefined ? 0 : 1),
    );
    return fc.integer({ min, max });
  }
  return fc.double({
    min: low ?? -1e6,
    max: high ?? 1e6,
    minExcluded: s.exclusiveMinimum !== undefined,
    maxExcluded: s.exclusiveMaximum !== undefined,
    noNaN: true,
    noDefaultInfinity: true,
  });
}

function objectArb(s: JsonSchema, root: JsonSchema): fc.Arbitrary<Record<string, unknown>> {
  const shape = Object.fromEntries(
    Object.entries(s.properties ?? {}).map(([key, prop]) => [key, build(prop, root)]),
  );
  return fc.record(shape, { requiredKeys: [...(s.required ?? [])] });
}

function resolveRef(ref: string, root: JsonSchema): JsonSchema {
  const match = /^#\/(\$defs|definitions)\/(.+)$/.exec(ref);
  const defs = match?.[1] === 'definitions' ? root.definitions : root.$defs;
  const target = match === null ? undefined : defs?.[match[2] ?? ''];
  return target ?? unsupported(`$ref "${ref}" (only local #/$defs references)`);
}

function build(s: JsonSchema, root: JsonSchema): fc.Arbitrary<unknown> {
  if (s.$ref !== undefined) return build(resolveRef(s.$ref, root), root);
  if (s.const !== undefined) return fc.constant(s.const);
  if (s.enum !== undefined) return fc.constantFrom(...s.enum);
  const options = s.anyOf ?? s.oneOf;
  if (options !== undefined) return fc.oneof(...options.map((o) => build(o, root)));
  if (Array.isArray(s.type)) {
    const types = s.type as readonly string[];
    return fc.oneof(...types.map((type) => build({ ...s, type }, root)));
  }
  switch (s.type) {
    case 'string':
      return stringArb(s);
    case 'integer':
      return numberArb(s, true);
    case 'number':
      return numberArb(s, false);
    case 'boolean':
      return fc.boolean();
    case 'null':
      return fc.constant(null);
    case 'array':
      return fc.array(s.items === undefined ? fc.anything() : build(s.items, root), {
        minLength: s.minItems ?? 0,
        maxLength: s.maxItems ?? Math.max(s.minItems ?? 0, 5),
      });
    case 'object':
      return objectArb(s, root);
    case undefined:
      return fc.anything();
    default:
      return unsupported(`type "${String(s.type)}"`);
  }
}

/** A fast-check arbitrary for a JSON Schema (common keywords; see `JsonSchema`). */
export function arbitraryFromJsonSchema(schema: JsonSchema): fc.Arbitrary<unknown> {
  return build(schema, schema);
}

const standardJson = (schema: StandardSchemaV1): StandardJsonSchema | undefined => {
  const std = schema['~standard'] as StandardSchemaV1['~standard'] & {
    readonly jsonSchema?: StandardJsonSchema;
  };
  return std.jsonSchema;
};

/**
 * A fast-check arbitrary producing values a Standard Schema accepts.
 *
 *   fc.assert(fc.property(arbitraryFrom(Signup), (data) => …));          // Zod 4
 *   arbitraryFrom(Signup, { toJsonSchema: (s) => toJsonSchema(s as never) }); // Valibot
 */
export function arbitraryFrom<Schema extends StandardSchemaV1>(
  schema: Schema,
  options: ArbitraryOptions = {},
): fc.Arbitrary<StandardSchemaV1.InferInput<Schema>> {
  const side = options.side ?? 'input';
  const standard = standardJson(schema);
  const json =
    standard !== undefined
      ? standard[side]({ target: 'draft-2020-12' })
      : options.toJsonSchema?.(schema);
  if (json === undefined) {
    throw new Error(
      `arbitraryFrom: "${schema['~standard'].vendor}" schemas don't expose Standard JSON ` +
        `Schema. Pass { toJsonSchema } (e.g. toJsonSchema from @valibot/to-json-schema).`,
    );
  }
  const arb = arbitraryFromJsonSchema(json as JsonSchema);
  const valid =
    options.validOnly === false
      ? arb
      : arb.filter((value) => {
          const result = schema['~standard'].validate(value);
          return result instanceof Promise || result.issues === undefined;
        });
  // Values are generated from the schema's JSON Schema (and filtered by it).
  return valid;
}
