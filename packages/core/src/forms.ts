// Forms, client half (docs/design-docs/0008-forms.md). Schemas are any Standard Schema v1.
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { FieldIssue, FormFields, IntentInput, IntentParser, IntentRejected } from './types.js';

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

/** The text fields of a parsed form, for re-filling it after a rejection. */
export function formFields(data: Readonly<Record<string, FormValue>>): FormFields {
  const out: Record<string, string | readonly string[]> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') out[key] = value;
    else if (Array.isArray(value)) out[key] = value.filter((v) => typeof v === 'string');
  }
  return out;
}

const schemaOf = <Schema extends StandardSchemaV1>(
  definition: FormDefinition<Schema> | Schema,
): Schema => ('_tag' in definition ? definition.schema : definition);

export type FormResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly rejected: IntentRejected };

/**
 * Validates submitted form data exactly as `form()` does. The no-JS server path
 * (`formAction` in @gyral/ssr) uses it, so both paths produce the same `IntentRejected`.
 */
export function validateForm<Schema extends StandardSchemaV1>(
  definition: FormDefinition<Schema> | Schema,
  intent: string,
  data: FormData,
): FormResult<Out<Schema>> | Promise<FormResult<Out<Schema>>> {
  const raw = formDataToObject(data);
  const values = formFields(raw);
  const rejected = (issues: readonly FieldIssue[]): FormResult<Out<Schema>> => ({
    ok: false,
    rejected: { _tag: 'IntentRejected', intent, issues, values },
  });
  const settle = (result: StandardSchemaV1.Result<Out<Schema>>): FormResult<Out<Schema>> =>
    result.issues === undefined
      ? { ok: true, data: result.value }
      : rejected(toIssues(result.issues, ''));
  const result = schemaOf(definition)['~standard'].validate(raw);
  return result instanceof Promise ? result.then(settle) : settle(result);
}

/**
 * Intent parser for a `<form data-intent>` submission, validated by a schema. `toMsg` also
 * gets the raw `FormData`, for sending the submission to the server (`submitForm` in
 * @gyral/http) after it passed client-side validation.
 */
export function form<Schema extends StandardSchemaV1, M>(
  definition: FormDefinition<Schema> | Schema,
  toMsg: (data: Out<Schema>, formData: FormData) => M | undefined,
): IntentParser<M> {
  return (input: IntentInput) => {
    const { formData } = input;
    if (formData === undefined) return undefined;
    const toParsed = (r: FormResult<Out<Schema>>): Parsed<M> =>
      r.ok ? toMsg(r.data, formData) : r.rejected;
    const result = validateForm(definition, input.name, formData);
    return result instanceof Promise ? result.then(toParsed) : toParsed(result);
  };
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

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

const isIssue = (value: unknown): value is FieldIssue =>
  isRecord(value) && typeof value['path'] === 'string' && typeof value['message'] === 'string';

const isFields = (value: unknown): value is FormFields =>
  isRecord(value) &&
  Object.values(value).every(
    (v) => typeof v === 'string' || (Array.isArray(v) && v.every((x) => typeof x === 'string')),
  );

/**
 * A Standard Schema for `IntentRejected` as a server sends it (`formAction` answering JSON).
 * Used by `submitForm` in @gyral/http to recognise a 422 rejection; usable with any decoder.
 */
export const intentRejectedSchema: StandardSchemaV1<unknown, IntentRejected> = {
  '~standard': {
    version: 1,
    vendor: 'gyral',
    validate: (value) => {
      if (
        !isRecord(value) ||
        value['_tag'] !== 'IntentRejected' ||
        typeof value['intent'] !== 'string' ||
        !Array.isArray(value['issues']) ||
        !value['issues'].every(isIssue) ||
        (value['values'] !== undefined && !isFields(value['values']))
      ) {
        return { issues: [{ message: 'Expected an IntentRejected message' }] };
      }
      const rejected: IntentRejected = {
        _tag: 'IntentRejected',
        intent: value['intent'],
        issues: value['issues'],
        ...(value['values'] === undefined ? {} : { values: value['values'] }),
      };
      return { value: rejected };
    },
  },
};

/** A server's JSON answer to a valid form post that would have redirected without JS. */
export interface FormRedirected {
  readonly _tag: 'Redirected';
  readonly location: string;
}

/** The `location` of a `FormRedirected` answer (from `formAction` in @gyral/ssr), if it is one. */
export function redirectedTo(body: unknown): string | undefined {
  return isRecord(body) && body['_tag'] === 'Redirected' && typeof body['location'] === 'string'
    ? body['location']
    : undefined;
}
