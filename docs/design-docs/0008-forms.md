# ADR 0008 — Forms: native constraints, schema-parsed intents, errors in the model

Status: **accepted** (2026-10-04). Client half: gyral-czi.3. Server half: gyral-4k7.2 (below).

## Context

Industry direction (React 19 actions, SvelteKit form actions and Superforms, SolidStart
actions, Angular Signal Forms, Astro Actions):

1. One schema is the source of truth on both client and server.
2. Forms work without JS, then get enhanced.
3. The browser's own validation is back, especially `:user-invalid`.

## Decision: five layers, each optional

1. **Native constraints first.** `required`, `type`, `pattern`, `min`/`max` in markup block
   bad submits for free. CSS `:user-invalid` handles error styling, so the model never stores
   "touched" or "dirty" state.
2. **Schema-parsed intent.** `form(schema, toMsg)` returns an intent parser that accepts any
   Standard Schema v1 (sync or async):
   ```ts
   // forms/register.ts — shared by the client component and (later) the server route
   export const RegisterForm = defineForm(v.object({ email: v.pipe(v.string(), v.email()), … }));
   // component
   intent: { Register: form(RegisterForm, (data) => ({ _tag: 'Register', ...data })) }
   ```
   - FormData becomes a plain object through **one pure function shared with the server**
     (`formDataToObject`): repeated names become arrays, and `File` values pass through.
     Values are strings; the schema coerces them.
   - On success, `toMsg(data)` is sent. On failure, a framework message is sent:
     `{ _tag: 'IntentRejected', intent: 'Register', issues: readonly { path: string; message: string }[] }`.
     The path is dot-joined and matches the field `name`. Its reducer is optional (like
     `PropsChanged`).
   - `fieldErrors(issues)` turns issues into `Record<string, readonly string[]>`.
   - `field(schema, toMsg)` does the same for a single input, used with `data-intent-on="input"`
     for checks while typing.
   - Intent parsers may return a Promise, because Standard Schema validation can be async.
3. **Errors live in model state** (they are data; tests can see them) **and are mirrored to
   native validity.** The `invalid(message?)` element directive calls `setCustomValidity` and
   sets `aria-invalid`. It also clears the custom error on that field's next `input`, so the
   user can resubmit. As a result, `:user-invalid`, native error bubbles and the model all
   agree. Views link each message with `aria-describedby`.
4. **Async checks** (such as "is this username taken") are ordinary effects through the http
   driver with `switch` concurrency. No special mechanism.
5. **Progressive enhancement (server half, with @gyral/ssr).** Forms keep a real
   `action`/`method="post"`. When JS is loaded, Gyral intercepts the submit. Without JS, the
   server route uses `formAction(RegisterForm, handler)`, parses with the **same** `defineForm`
   schema and `formDataToObject`, and on failure renders the page with the **same**
   `IntentRejected` issues seeded into initial state. Errors therefore render identically
   with or without JS.

## Server half (gyral-4k7.2, 2026-10-04)

Implemented in `@gyral/ssr` on top of ADR 0012. Example: `examples/register`.

```ts
app.post('/', (c) =>
  formAction(RegisterForm, {
    intent: 'Register', // the form's data-intent name
    valid: (data) => seeOther(`/?welcome=${encodeURIComponent(data.name)}`),
    invalid: (rejected) =>
      renderPage({ …, body: html`<gy-register .initialMessages=${[rejected]}>` }, { status: 422 }),
  })(c.req.raw),
);
```

- **One validator.** Core's `validateForm(definition, intent, formData)` is what the client's
  `form()` parser calls, and what `formAction` calls on the server. Both produce the same
  `IntentRejected`, and only one function turns form data into an object or a rejection.
- **One reducer.** The server does not compute error state itself. It renders the component
  with `initialMessages: [rejected]`, a property every `define()` element has. Those messages
  run through `update` right after `init` and before the first render, so the component's own
  `IntentRejected` reducer builds the error state on the server, exactly as it does in the
  browser. The resulting state is seeded (ADR 0012), so hydration resumes from it.
  `initialMessages` is ignored when an element resumes from a seed.
- **Re-filling.** `IntentRejected.values` (from `form()` and `validateForm`) carries the
  submitted text fields; Files are dropped. The reducer decides what to keep. **Never keep
  passwords**: state is serialized into the page.
- **Post/Redirect/Get.** On success, `seeOther(url)` returns a 303, so reloading never
  resubmits. On failure, the handler re-renders with 422. A non-form body gets 415.
- **Accessibility without JS.** `invalid()` is an element directive that calls
  `setCustomValidity`, and the server renderer skips it. Views therefore also render
  `aria-invalid` as a plain attribute and link the message with `aria-describedby`. After
  hydration, `invalid()` mirrors the seeded errors into native validity.
- **Parity is tested.** A golden file of the server's 422 response is compared, after
  canonicalising it (Lit markers stripped, attributes sorted), with the markup the JS path
  renders for the same input.

## Consequences

- Core depends on `@standard-schema/spec` types only. Users pick Zod, Valibot, ArkType or
  Effect Schema.
- Reusable inputs are form-associated custom elements (`ElementInternals.setValidity`), per
  the lit-web-apps skill.
- `defineForm` only wraps the schema for now. It is the place where SSR will attach its route
  metadata later.

## Addendum: the JS-path round trip (gyral-czi.25, 2026-10-04)

Real forms need the server to decide even with JavaScript on (email already taken, wrong
password, persisting the data). gyral-shop's login needed a JSON endpoint, a navigation driver
and hand-mapped rejections. Now the pair is built in:

```ts
// component
intent: { Register: form(RegisterForm, (data, raw) => ({ _tag: 'Register', form: raw })) },
update: {
  Register: (s, m) => [{ ...s, busy: true }, [submitForm('/register', m.form, {
    csrf: { meta: 'csrf-token' },                        // read when the request runs
    onSuccess: (body) => ({ _tag: 'Done', location: redirectedTo(body) }),
    onFailure: () => ({ _tag: 'Failed' }),               // network, 500, …
  })]],
  IntentRejected: (s, m) => …,                           // client AND server rejections
}
// server (Hono)
app.post('/register', (c) => formAction(RegisterForm, {
  intent: 'Register',
  valid: async (data) => (await taken(data.email))
    ? rejectWith([{ path: 'email', message: 'That email is already registered.' }])
    : seeOther('/welcome'),
  invalid: (rejected) => renderForm(rejected, 422),
})(c.req.raw));
```

- `form()`'s `toMsg` also receives the raw `FormData`. `submitForm` (in `@gyral/http`) posts it
  unchanged, so `formAction` parses the JS post exactly like a no-JS post.
- `formAction` answers `Accept: application/json` with JSON. A redirect becomes
  `200 { _tag: 'Redirected', location }`, keeping other headers such as `set-cookie`. A
  rejection becomes `422` with the `IntentRejected`, **without `values`**, so passwords are
  never echoed. Browser form posts still get HTML.
- `rejectWith(issues | message)` lets `valid` reject a schema-valid submission. Both paths turn
  it into the same `IntentRejected` (a string is a form-level issue with path `''`).
- `submitForm` decodes a 422 body with `intentRejectedSchema` and dispatches it as the
  framework message `IntentRejected`. Commands may therefore yield `IntentRejected`: `Next`
  allows `Command<M | IntentRejected>`. Default concurrency is `exhaust` on lane
  `form:<url>`, so a double submit is ignored.
- `IntentRejected.values` is typed `FormFields | undefined`, so schemas with plain optional
  fields (valibot `optional`) decode into it under `exactOptionalPropertyTypes`.
- `HttpStatusError` now carries the response `body` and, with an `errorSchema`, a decoded
  `detail` (gyral-ud5.7).
- The register example uses the round trip. The server stores emails and rejects duplicates on
  both paths, which covers the earlier bead "Register example: JS path persists via the same
  POST route".
