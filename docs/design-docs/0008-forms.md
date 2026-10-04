# ADR 0008 — Forms: native constraints, schema-parsed intents, errors in the model

Status: **accepted** (2026-10-04). The client half is in v0.1; the server half ships with SSR.

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

## Consequences

- Core depends on `@standard-schema/spec` types only. Users pick Zod, Valibot, ArkType or
  Effect Schema.
- Reusable inputs are form-associated custom elements (`ElementInternals.setValidity`), per
  the lit-web-apps skill.
- `defineForm` only wraps the schema for now. It is the place where SSR will attach its route
  metadata later.
