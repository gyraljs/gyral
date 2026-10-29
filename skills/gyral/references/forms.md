# Forms

Start with the browser's own validation: it needs no extra package and works in any app,
including a new `basic` one. This is the path the gyral.dev
[Forms guide](https://gyral.dev/docs/forms/#native-validation) and the
[signup recipe](https://gyral.dev/docs/recipes/#a-signup-form-with-native-validation) teach
(the recipe adds model and browser tests). With the MCP server,
`scaffold_component({ tag, kind: "form-native" })` writes a working starting point.
Reach for a schema library only when a server must check the same rules
([below](#when-you-need-a-schema-library)).

## Native validation: novalidate plus the browser's validity

**`required` without `novalidate` hides your errors.** The browser checks the constraints
before it fires `submit`; when one fails it shows its own bubble and fires no `submit`, so the
parser and your messages never run. Put `novalidate` on the form and keep the constraints on
the fields: they still set each field's `validity`, which the submit parser reads.

A complete signup form: every error at once, `aria-invalid` and `aria-describedby` on each
field, an announced summary, focus on the first invalid field, and the trimmed values on
success:

```ts
// src/signup-form.ts
import { define, focus, html } from '@gyral/core';

/** The fields in page order: the first one with an error gets focus. */
const FIELDS = ['name', 'email', 'terms'] as const;
type Field = (typeof FIELDS)[number];

/** One message per field; '' means no error. */
type Errors = Readonly<Record<Field, string>>;
const NO_ERRORS: Errors = { name: '', email: '', terms: '' };

interface State {
  readonly errors: Errors;
  readonly signedUp: { readonly name: string; readonly email: string } | undefined;
}

type Msg =
  | { readonly _tag: 'Rejected'; readonly errors: Errors }
  | { readonly _tag: 'SignedUp'; readonly name: string; readonly email: string };

/** Your message for a control's first problem, read from the browser's checks, or ''. */
function problemWith(input: HTMLInputElement): string {
  const { validity } = input;
  switch (input.name) {
    case 'name': {
      // `required` accepts "  ", and `tooShort` is set only after typing: check the trimmed text.
      const name = input.value.trim();
      if (name === '') return 'Enter your name.';
      return name.length < 2 ? 'Use at least 2 characters.' : '';
    }
    case 'email':
      if (validity.valueMissing || input.value.trim() === '') return 'Enter your email address.';
      return validity.typeMismatch ? 'Enter an email address like ada@example.com.' : '';
    case 'terms':
      return validity.valueMissing ? 'Agree to the terms to sign up.' : '';
    default:
      return '';
  }
}

/** Parses a submit: every field's error, or the clean values from the FormData. */
function submission(form: Element, data: FormData | undefined): Msg | undefined {
  if (!(form instanceof HTMLFormElement) || data === undefined) return undefined;
  const errors: Record<Field, string> = { ...NO_ERRORS };
  for (const field of FIELDS) {
    const input = form.elements.namedItem(field);
    if (input instanceof HTMLInputElement) errors[field] = problemWith(input);
  }
  if (FIELDS.some((f) => errors[f] !== '')) return { _tag: 'Rejected', errors };
  const text = (field: Field): string => {
    const value = data.get(field);
    return typeof value === 'string' ? value.trim() : '';
  };
  return { _tag: 'SignedUp', name: text('name'), email: text('email') };
}

const errorCount = (errors: Errors): number => FIELDS.filter((f) => errors[f] !== '').length;

export const SignupForm = define<State, Msg>()('signup-form', {
  init: () => ({ errors: NO_ERRORS, signedUp: undefined }),
  intent: {
    // `Submit` is not a message tag, so its parser may return either message.
    Submit: ({ target, formData }) => submission(target, formData),
  },
  update: {
    Rejected: (s, m) => {
      const first = FIELDS.find((f) => m.errors[f] !== '');
      return [
        { errors: m.errors, signedUp: undefined },
        first === undefined ? [] : [focus(`#${first}`)],
      ];
    },
    SignedUp: (_s, m) => ({ errors: NO_ERRORS, signedUp: { name: m.name, email: m.email } }),
  },
  view: (s, i) => html`
    <form novalidate data-intent=${i.Submit}>
      <p role="alert">
        ${errorCount(s.errors) === 0 ? '' : `Fix ${String(errorCount(s.errors))} field(s).`}
      </p>

      <label for="name">Name</label>
      <input
        id="name"
        name="name"
        autocomplete="name"
        required
        minlength="2"
        aria-invalid=${s.errors.name !== ''}
        aria-describedby="name-error"
      />
      <p id="name-error">${s.errors.name}</p>

      <label for="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autocomplete="email"
        required
        aria-invalid=${s.errors.email !== ''}
        aria-describedby="email-error"
      />
      <p id="email-error">${s.errors.email}</p>

      <input
        id="terms"
        name="terms"
        type="checkbox"
        required
        aria-invalid=${s.errors.terms !== ''}
        aria-describedby="terms-error"
      />
      <label for="terms">I agree to the terms</label>
      <p id="terms-error">${s.errors.terms}</p>

      <button>Sign up</button>
    </form>
    <p role="status">
      ${s.signedUp === undefined ? '' : `Signed up ${s.signedUp.name} (${s.signedUp.email}).`}
    </p>
  `,
});
```

How it works:

- **The submit parser reads the form.** `target` is the `<form>`; `form.elements.namedItem()`
  gives each control, whose `validity` (`valueMissing`, `typeMismatch`, `tooShort`,
  `patternMismatch`) says what is wrong; `formData` holds the values. Reading the form is input
  parsing, the intent layer's job: reducers only see `Rejected` or `SignedUp`.
- **Errors are state**, one string per field. The view writes `aria-invalid`, the message, and
  `aria-describedby` linking the two; `role="alert"` announces the summary and
  `role="status"` the success.
- **Focus is a command**: `focus('#name')` from the `Rejected` reducer runs after the render.
- **What the user typed stays.** The inputs are not re-created, so their values survive a
  rejection with no `value=` binding. Bind `value=${…}` only when the model must set a value.
- **Enter submits**, because the form has a submit button; a click and Enter are the same
  `submit` event.
- **Passwords stay in the `FormData`**: put only what you show in a message or in state.
- **Import the module from the entry.** `define()` registers `<signup-form>` when this module
  runs, so `src/main.ts` (or a module it imports) needs `import './signup-form.js';`.
  Otherwise the tag stays an empty unknown element and every check of it fails.

Test the reducers with `step(SignupForm.spec, state, msg)` and `focusTargetsIn(commands)`
(testing.md), and the parser in a browser with `mount()`; the recipe has both tests.

Each constraint sets one flag: `required` → `valueMissing` (a value of spaces passes: trim it);
`type="email"`/`"url"` → `typeMismatch` (non-empty values only); `minlength`/`maxlength` →
`tooShort`/`tooLong` (only after the user edits); `pattern` → `patternMismatch`; `min`/`max`/
`step` → `rangeUnderflow`/`rangeOverflow`/`stepMismatch`. A message set with
`setCustomValidity()` (as `invalid()` does) sets `customError`, so read the specific flags,
not `validity.valid`.

### Errors as issues: `IntentRejected`, `fieldErrors`, `invalid`

The same native checks can produce the message `form()` sends, so the schema path below reuses
the reducer and the view unchanged. The parser returns
`{ _tag: 'IntentRejected', intent: 'Submit', issues, values }`; `fieldErrors(issues)` groups the
issues by field; `invalid(errors)` mirrors them into native validity (`setCustomValidity`,
`aria-invalid`, `:user-invalid`) and clears when the user edits the field. This is what
`scaffold_component` kind `form-native` writes, with custom messages for every field:

```ts
import { define, fieldErrors, focus, html, invalid, type FieldIssue } from '@gyral/core';

interface State {
  readonly errors: Readonly<Record<string, readonly string[]>>;
  readonly email: string | undefined;
}
type Msg = { readonly _tag: 'Submit'; readonly email: string };

function issuesOf(form: HTMLFormElement): FieldIssue[] {
  const email = form.elements.namedItem('email');
  if (!(email instanceof HTMLInputElement)) return [];
  if (email.validity.valueMissing) return [{ path: 'email', message: 'Enter your email.' }];
  if (email.validity.typeMismatch) return [{ path: 'email', message: 'Check the address.' }];
  return [];
}

export const Newsletter = define<State, Msg>()('my-newsletter', {
  init: () => ({ errors: {}, email: undefined }),
  intent: {
    Submit: ({ target, formData }) => {
      if (!(target instanceof HTMLFormElement)) return undefined;
      const issues = issuesOf(target);
      const email = formData?.get('email');
      if (issues.length > 0) return { _tag: 'IntentRejected', intent: 'Submit', issues };
      return { _tag: 'Submit', email: typeof email === 'string' ? email.trim() : '' };
    },
  },
  update: {
    Submit: (_s, m) => ({ errors: {}, email: m.email }),
    IntentRejected: (s, m) => {
      const first = m.issues[0]?.path;
      return [
        { ...s, errors: fieldErrors(m.issues) },
        first === undefined ? [] : [focus(`#${first}`)],
      ];
    },
  },
  view: (s, i) => html`
    <form novalidate data-intent=${i.Submit}>
      <label for="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        required
        aria-describedby="email-error"
        ${invalid(s.errors['email'])}
      />
      <span id="email-error">${s.errors['email']?.join(' ') ?? ''}</span>
      <button>Subscribe</button>
    </form>
    <p role="status">${s.email === undefined ? '' : `Subscribed ${s.email}.`}</p>
  `,
});
```

`invalid()` writes `aria-invalid` itself (on the server too), so don't write it twice.

## When you need a schema library

One schema validates on both sides: the client's `form()` intent and the server's
`formAction`, and the form works **without JavaScript** (a normal `POST`) and enhances when JS
is present. Any **Standard Schema** library works (Valibot, Zod, ArkType, Effect Schema). To
name the interface in your own helpers, import `type StandardSchemaV1` from `@gyral/core`.
This path also needs
`@gyral/http` to post and `@gyral/ssr` for the server half.

### Define the schema once

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

### The schema component

- `form(definition, (data, formData) => msg)` validates the submission. Invalid → Gyral sends
  `IntentRejected { intent, issues, values }` to the optional `IntentRejected` reducer.
- `fieldErrors(issues)` groups issues by field name; keep the result in state.
- `invalid(errors)` is an element hook: it mirrors model errors to native validity
  (`setCustomValidity`, `aria-invalid`, `:user-invalid`) and clears when the user edits the
  field. Its server half writes `aria-invalid="true"` into the start tag, so don't write it
  twice.
- Render the error text as plain markup, so the no-JS (server) render announces errors too.
- `submitForm(url, formData, { onSuccess, onFailure })` posts the valid submission; a server
  422 comes back as the same `IntentRejected`. A CSRF token from a `<meta>` is added by the
  http driver, configured once for the app:
  `provideDrivers(document.body, [makeHttpDriver({ headers: csrfFromMeta('csrf-token') })])`.
  `csrf: { token }` sends a token the app already holds.

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
  /** Hydrated: the schema validates, so the browser's own check steps aside. */
  readonly live: boolean;
}
type Msg =
  | { readonly _tag: 'Submit'; readonly form: FormData }
  | { readonly _tag: 'Done' }
  | { readonly _tag: 'Failed' };

const text = (values: FormFields, key: string): string => {
  const value = values[key];
  return typeof value === 'string' ? value : '';
};

export const Signup = define<State, Msg>()('my-signup', {
  init: () => ({ values: {}, errors: {}, done: false, live: false }),
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
        }),
      ],
    ],
    Done: (s) => ({ ...s, done: true }),
    Failed: (s) => ({ ...s, errors: { '': ['Something went wrong. Try again.'] } }),
    // Without JavaScript the browser validates (the server too); once hydrated, the schema does.
    Hydrated: (s) => ({ ...s, live: true }),
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
      : html`<form data-intent=${i.Submit} ?novalidate=${s.live} action="/signup" method="post">
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

Never keep passwords in state: state is serialized into the page. Secret fields never come back
in `values` anyway: a name containing `password`, `passcode`, `csrf` or `xsrf` is secret by
itself, and others are listed in the definition (`secret` takes any posted field name, inside
the schema or not, such as a hidden `_session` field). Development builds warn about an unlisted field that looks secret
(`token`, `card`, `cvc`, `pin`, …), and the devtools timeline shows secrets as `[secret]`.

```ts
import { defineForm } from '@gyral/core';
import * as v from 'valibot';

const Checkout = defineForm(
  v.object({
    email: v.pipe(v.string(), v.email('Enter a valid email address.')),
    card: v.pipe(v.string(), v.regex(/^\d{16}$/, 'Enter the 16-digit card number.')),
    cvc: v.pipe(v.string(), v.regex(/^\d{3,4}$/, 'Enter the security code.')),
  }),
  { secret: ['card', 'cvc'] },
);
// A rejection's values: { email } only, on the JS and the no-JS path alike.
export { Checkout };
```

## What the user typed stays until the model changes

`value=`, `?checked`, `?selected`, `?open` and `<textarea>` content are written only when the
model's value for them changes; then the model wins, even over an edit. Any other render
(another field's message, a refused edit, a rejection that keeps `values`) leaves the controls
as the user left them, so passwords the model never holds stay typed after a rejection.

To clear or restore a form, change the model. `keyed(key, …)` re-creates the controls with the
model's values (`form.reset()` would restore the first render's values instead):

```ts
import { define, html, intentsOf, keyed, type TemplateResult } from '@gyral/core';

interface State {
  readonly note: string;
  readonly formKey: number;
}
type Msg = { readonly _tag: 'Note'; readonly value: string } | { readonly _tag: 'Clear' };
const i = intentsOf<typeof Notes>();

const fields = (s: State): TemplateResult =>
  html`<form>
    <textarea name="note" data-intent=${i.Note}>${s.note}</textarea>
    <button type="button" data-intent=${i.Clear}>Clear</button>
  </form>`;

export const Notes = define<State, Msg>()('my-notes', {
  init: () => ({ note: '', formKey: 0 }),
  intent: {
    Note: ({ value }) => ({ _tag: 'Note', value: value ?? '' }),
    Clear: true,
  },
  update: {
    Note: (s, m) => ({ ...s, note: m.value }),
    // A new key: the form's elements are replaced by fresh ones with the model's values.
    Clear: (s) => ({ note: '', formKey: s.formKey + 1 }),
  },
  view: (s) => html`${keyed(s.formKey, fields(s))}`,
});
```

Here `note: ''` alone would also clear the textarea whenever the model held text; the key also
covers edits the model never saw (or refused).

## One control, live: `field()`

```ts
import { define, field, html } from '@gyral/core';
import * as v from 'valibot';

interface State {
  readonly zip: string;
  readonly error: string | undefined;
}
type Msg = { readonly _tag: 'Zip'; readonly zip: string };

export const ZipInput = define<State, Msg>()('my-zip', {
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
  for a server-only check (email taken). `submitForm` gets `{ _tag: 'Redirected', location }`;
  `redirectedTo(body)` from `@gyral/http` reads the location (or `undefined`).
- invalid → `invalid(rejected)` re-renders the page with the component's
  `.initialMessages=${[rejected]}`, so the same `IntentRejected` reducer renders the errors.
  JSON clients get `422` with the issues instead (no `values`: the client still has them).

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

### Re-filling a form your own route validates

`formAction` puts the submitted values in `IntentRejected.values` for you. A route that checks a
submission itself (a contact form that also calls a spam filter, say) gets the same values with
`definition.values(formData)`: the text values keyed by the form's fields, repeated names as
arrays, `File`s and secret fields left out. Render them back into the form so nothing typed is
lost. `definition.validate(formData, intent)` is the validation `form()` and `formAction` run.

```ts
import { defineForm, html, type TemplateResult } from '@gyral/core';
import * as v from 'valibot';

const Contact = defineForm(
  v.object({
    email: v.pipe(v.string(), v.email('Enter a valid email address.')),
    message: v.pipe(v.string(), v.nonEmpty('Write a message.')),
  }),
);

/** The form again, with what was submitted and the server's error. */
function contactForm(data: FormData, error: string): TemplateResult {
  const values = Contact.values(data);
  const text = (value: string | readonly string[] | undefined): string =>
    typeof value === 'string' ? value : '';
  return html`<form method="post">
    <input name="email" type="email" value=${text(values.email)} />
    <textarea name="message">${text(values.message)}</textarea>
    <p role="alert">${error}</p>
    <button>Send</button>
  </form>`;
}
```

# Native custom form controls

Use `formAssociated: { value: (s) => s.value }` in a component spec to participate in the
owning form under the host's native `name` attribute. Return null to omit the control.
`state` can project a separate string/File/FormData restoration value. Optional `validity`
projects `{ flags: { customError: true }, message: 'Explain the problem', anchor: 'input' }`;
return undefined to clear validity. The anchor selects a control in the component's root.
Handle `FormReset`, `FormDisabled` and `FormStateRestore` in `update` when needed; the last
message carries `state` and `mode` (`restore` or `autocomplete`). Mirror disabled state to
inner controls. These reducers are optional; reset does not rerun init automatically.

SSR renders the view without native custom-control registration. For submission before
JavaScript, render a native fallback input in the server/first-client view. Submit null
from the custom control until a parsed input event transfers the live value to the model;
then switch to the enhanced mode and remove its name (or disable a separate fallback
control) to avoid duplicate entries while keeping the interactive control usable.
Switching on `Hydrated` alone can lose values typed before hydration; Gyral does not
automatically read arbitrary fallback controls into model state. Keep value/validity projections pure; never attach
ElementInternals in component code. Forms and `states` share Gyral's single attachment.
