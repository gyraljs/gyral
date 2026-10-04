// Forms, client half (docs/design-docs/0008-forms.md). Schemas are any Standard Schema v1.
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { FieldIssue, IntentInput, IntentParser, IntentRejected } from './types.js';

/** A form's schema, shared by the client component and (with @gyral/ssr) the server route. */
export interface FormDefinition<Schema extends StandardSchemaV1> {
  readonly _tag: 'FormDefinition';
  readonly schema: Schema;
}

export function defineForm<Schema extends StandardSchemaV1>(
  schema: Schema,
): FormDefinition<Schema> {
  return { _tag: 'FormDefinition', schema };
}

export type FormValue = FormDataEntryValue | readonly FormDataEntryValue[];

/**
 * FormData to a plain object. The same function runs on the server, so both sides agree.
 * Repeated names become arrays; a `name[]` suffix always yields an array (named `name`).
 * Values stay strings (or Files): the schema coerces them.
 */
export function formDataToObject(data: FormData): Readonly<Record<string, FormValue>> {
  const out: Record<string, FormValue> = {};
  for (const key of new Set(data.keys())) {
    const values = data.getAll(key);
    const [first] = values;
    if (key.endsWith('[]')) out[key.slice(0, -2)] = values;
    else if (values.length === 1 && first !== undefined) out[key] = first;
    else out[key] = values;
  }
  return out;
}

const segment = (s: PropertyKey | StandardSchemaV1.PathSegment): string =>
  String(typeof s === 'object' ? s.key : s);

function toIssues(
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
  fallbackPath: string,
): FieldIssue[] {
  return issues.map((issue) => {
    const path = issue.path?.map(segment).join('.') ?? '';
    return { path: path === '' ? fallbackPath : path, message: issue.message };
  });
}

type Out<Schema extends StandardSchemaV1> = StandardSchemaV1.InferOutput<Schema>;
type Parsed<M> = M | IntentRejected | undefined;

function parse<Schema extends StandardSchemaV1, M>(
  schema: Schema,
  value: unknown,
  intent: string,
  fallbackPath: string,
  toMsg: (data: Out<Schema>) => M | undefined,
): Parsed<M> | Promise<Parsed<M>> {
  const settle = (result: StandardSchemaV1.Result<Out<Schema>>): Parsed<M> =>
    result.issues === undefined
      ? toMsg(result.value)
      : { _tag: 'IntentRejected', intent, issues: toIssues(result.issues, fallbackPath) };
  const result = schema['~standard'].validate(value);
  return result instanceof Promise ? result.then(settle) : settle(result);
}

/** Intent parser for a `<form data-intent>` submission, validated by a schema. */
export function form<Schema extends StandardSchemaV1, M>(
  definition: FormDefinition<Schema> | Schema,
  toMsg: (data: Out<Schema>) => M | undefined,
): IntentParser<M> {
  const schema = '_tag' in definition ? definition.schema : definition;
  return (input: IntentInput) =>
    input.formData === undefined
      ? undefined
      : parse(schema, formDataToObject(input.formData), input.name, '', toMsg);
}

/**
 * Intent parser for one control (pair with `data-intent-on="input"` for live checks).
 * Validates `checked` for checkboxes and radios, otherwise `value`.
 */
export function field<Schema extends StandardSchemaV1, M>(
  schema: Schema,
  toMsg: (value: Out<Schema>) => M | undefined,
): IntentParser<M> {
  return (input: IntentInput) => {
    const name = input.target.getAttribute('name') ?? input.name;
    return parse(schema, input.checked ?? input.value, input.name, name, toMsg);
  };
}

/**
 * Groups issues by field name. Call it in the `IntentRejected` reducer and keep the result in
 * state: `invalid()` re-applies an error only when it gets a new array.
 */
export function fieldErrors(
  issues: readonly FieldIssue[],
): Readonly<Record<string, readonly string[]>> {
  const out: Record<string, string[]> = {};
  for (const { path, message } of issues) (out[path] ??= []).push(message);
  return out;
}
