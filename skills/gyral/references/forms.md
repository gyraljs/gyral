# Forms

One schema validates on both sides: the client's `form()` intent and the server's
`formAction`. Any **Standard Schema** library works (Valibot, Zod, ArkType, Effect Schema).
Forms work **without JavaScript** (a normal `POST`) and enhance when JS is present.

## Define the schema once

```ts
import { defineForm } from '@gyral/core';
import * as v from 'valibot';

export const SignupForm = defineForm(
  v.object({
    name: v.pipe(v.string(), v.trim(), v.nonEmpty('Enter a name.')),
    email: v.pipe(v.string(), v.trim(), v.email('Enter a valid email address.')),
    password: v.pipe(v.string(), v.minLength(8, 'Use at least 8 characters.')),
  }),
);
```

Native constraints in the markup (`required`, `type="email"`, `minlength`) catch easy cases
before submit; the schema adds what HTML can't express. Schemas may be async (a lookup).

## The component

- `form(definition, (data, formData) => msg)` validates the submission. Invalid → Gyral sends
  `IntentRejected { intent, issues, values }` to the optional `IntentRejected` reducer.
- `fieldErrors(issues)` groups issues by field name; keep the result in state.
- `invalid(errors)` is an element hook: it mirrors model errors to native validity
  (`setCustomValidity`, `aria-invalid`, `:user-invalid`) and clears when the user edits the
  field. Its server half writes `aria-invalid="true"` into the start tag, so don't write it
  twice.
- Render the error text as plain markup, so the no-JS (server) render announces errors too.
- `submitForm(url, formData, { onSuccess, onFailure, csrf? })` posts the valid submission; a
  server 422 comes back as the same `IntentRejected`.

```ts
import { define, fieldErrors, form, html, invalid, type FormFields } from '@gyral/core';
import { submitForm } from '@gyral/http';
import * as v from 'valibot';

const SignupForm = v.object({
  name: v.pipe(v.string(), v.trim(), v.nonEmpty('Enter a name.')),
  email: v.pipe(v.string(), v.trim(), v.email('Enter a valid email address.')),
});

interface State {
  readonly values: FormFields;
  readonly errors: Readonly<Record<string, readonly string[]>>;
  readonly done: boolean;
}
type Msg =
  | { readonly _tag: 'Submit'; readonly form: FormData }
  | { readonly _tag: 'Done' }
  | { readonly _tag: 'Failed' };

const text = (values: FormFields, key: string): string => {
  const value = values[key];
  return typeof value === 'string' ? value : '';
};

export const Signup = define<State, Msg>('my-signup', {
  init: () => ({ values: {}, errors: {}, done: false }),
  intent: {
    Submit: form(SignupForm, (_data, raw) => ({ _tag: 'Submit', form: raw })),
  },
  update: {
    // Valid in the browser: post the raw submission; the server still decides.
    Submit: (s, m) => [
      { ...s, errors: {} },
      [
        submitForm<Msg>('/signup', m.form, {
          onSuccess: () => ({ _tag: 'Done' }),
          onFailure: () => ({ _tag: 'Failed' }),
          csrf: { meta: 'csrf-token' },
        }),
      ],
    ],
    Done: (s) => ({ ...s, done: true }),
    Failed: (s) => ({ ...s, errors: { '': ['Something went wrong. Try again.'] } }),
    // Client-side and server-side (422) rejections arrive the same way.
    IntentRejected: (s, m) => ({
      ...s,
      values: m.values ?? s.values,
      errors: fieldErrors(m.issues),
    }),
  },
  view: (s, i) =>
    s.done
      ? html`<p role="status">Welcome!</p>`
      : html`<form data-intent=${i.Submit} action="/signup" method="post">
          ${(['name', 'email'] as const).map((f) => {
            const errors = s.errors[f];
            return html`<p>
              <label for=${f}>${f === 'name' ? 'Name' : 'Email'}</label>
              <input
                id=${f}
                name=${f}
                type=${f === 'email' ? 'email' : 'text'}
                required
                value=${text(s.values, f)}
                aria-describedby=${`${f}-error`}
                ${invalid(errors)}
              />
              <span id=${`${f}-error`}>${errors?.join(' ') ?? ''}</span>
            </p>`;
          })}
          <p role="alert">${s.errors['']?.join(' ') ?? ''}</p>
          <button>Sign up</button>
        </form>`,
});
```

Never keep passwords in state (or re-fill them from `values`): state is serialized into the
page.

## One control, live: `field()`

```ts
import { define, field, html } from '@gyral/core';
import * as v from 'valibot';

interface State {
  readonly zip: string;
  readonly error: string | undefined;
}
type Msg = { readonly _tag: 'Zip'; readonly zip: string };

export const ZipInput = define<State, Msg>('my-zip', {
  init: () => ({ zip: '', error: undefined }),
  intent: {
    Zip: field(v.pipe(v.string(), v.regex(/^\d{5}$/, 'Five digits.')), (zip) => ({
      _tag: 'Zip',
      zip,
    })),
  },
  update: {
    Zip: (_s, m) => ({ zip: m.zip, error: undefined }),
    IntentRejected: (s, m) => ({ ...s, error: m.issues[0]?.message }),
  },
  view: (s, i) =>
    html`<label>ZIP <input name="zip" value=${s.zip} data-intent=${i.Zip} /></label>
      <span>${s.error ?? ''}</span>`,
});
```

## The server half (no JavaScript, and the JSON answer for `submitForm`)

`formAction(definition, { intent, valid, invalid })` handles the `POST`:

- valid → your handler; usually `seeOther(url)` (Post/Redirect/Get), or `rejectWith(...)`
  for a server-only check (email taken). `submitForm` gets `{ _tag: 'Redirected', location }`.
- invalid → `invalid(rejected)` re-renders the page with the component's
  `.initialMessages=${[rejected]}`, so the same `IntentRejected` reducer renders the errors.
  JSON clients get `422` with the issues instead.

The re-rendered page seeds the rejected state, so hydration resumes with the errors shown.

```ts
import { defineForm, html, type IntentRejected } from '@gyral/core';
import { formAction, rejectWith, renderPage, seeOther } from '@gyral/ssr';
import * as v from 'valibot';

// formAction takes a defineForm() definition (form() accepts either).
const Signup = defineForm(v.object({ name: v.pipe(v.string(), v.nonEmpty('Enter a name.')) }));
const taken = new Set(['admin']);

const page = (rejected: IntentRejected | undefined, status: number): Response =>
  renderPage(
    {
      title: 'Sign up',
      body: html`<my-signup
        .initialMessages=${rejected === undefined ? [] : [rejected]}
      ></my-signup>`,
      scripts: ['/src/entry-client.ts'],
    },
    { status },
  );

/** A fetch handler: GET renders the form, POST validates it with the same schema. */
export async function handle(request: Request): Promise<Response> {
  if (request.method !== 'POST') return page(undefined, 200);
  return formAction(Signup, {
    intent: 'Submit', // the form's data-intent name
    valid: (data) =>
      taken.has(data.name.toLowerCase())
        ? rejectWith([{ path: 'name', message: 'That name is taken.' }])
        : seeOther('/welcome'),
    invalid: (rejected) => page(rejected, 422),
  })(request);
}
```
