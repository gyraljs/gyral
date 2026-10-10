import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import * as v from 'valibot';
import { defineForm, form, html } from '../src/index.js';
import { isSecretField } from '../src/internal.js';
import type { IntentInput, IntentRejected } from '../src/index.js';
import { renderToString } from '../src/server.js';

const Contact = defineForm(
  v.object({
    name: v.pipe(v.string(), v.nonEmpty('Enter a name.')),
    email: v.pipe(v.string(), v.email('Enter a valid email address.')),
    topics: v.array(v.string()),
    subscribe: v.optional(v.string()),
  }),
);

const submission = (): FormData => {
  const data = new FormData();
  data.append('name', 'Ada');
  data.append('email', 'not-an-email');
  data.append('topics', 'billing');
  data.append('topics', 'support');
  data.append('tags[]', 'urgent');
  data.append('subscribe', 'on');
  data.append('attachment', new File(['x'], 'notes.txt'));
  return data;
};

describe('definition.values', () => {
  it('returns text values: single strings, repeated names and name[] as arrays, no Files', () => {
    expect(Contact.values(submission())).toEqual({
      name: 'Ada',
      email: 'not-an-email',
      topics: ['billing', 'support'],
      tags: ['urgent'],
      subscribe: 'on',
    });
  });

  it('leaves out an unchecked checkbox and an empty submission', () => {
    expect(Contact.values(new FormData())).toEqual({});
  });

  it('matches the values a rejection carries', () => {
    const data = submission();
    const result = Contact.validate(data, 'Send');
    if (result instanceof Promise || result.ok) throw new Error('expected a sync rejection');
    expect(Contact.values(data)).toEqual(result.rejected.values);
  });

  it('keys the result by the definition', () => {
    const values = Contact.values(submission());
    expectTypeOf(values.name).toEqualTypeOf<string | readonly string[] | undefined>();
    // @ts-expect-error not a field of the form
    expect(values.phone).toBeUndefined();
  });

  it('re-fills a server-rendered form after failed validation', () => {
    const data = submission();
    const values = Contact.values(data);
    const text = (key: keyof typeof values): string => {
      const value = values[key];
      return typeof value === 'string' ? value : '';
    };
    const markup = renderToString(
      html`<form method="post">
        <input name="name" value=${text('name')} />
        <input name="email" type="email" value=${text('email')} aria-invalid="true" />
        <input name="subscribe" type="checkbox" ?checked=${values.subscribe !== undefined} />
      </form>`,
    );
    expect(markup).toContain('value="Ada"');
    expect(markup).toContain('value="not-an-email"');
    expect(markup).toMatch(/type="checkbox"[^>]*checked/);
  });
});

const Checkout = defineForm(
  v.object({
    email: v.pipe(v.string(), v.email('Enter a valid email address.')),
    password: v.pipe(v.string(), v.minLength(8, 'Use 8 characters or more.')),
    card: v.pipe(v.string(), v.regex(/^\d{16}$/, 'Enter the 16-digit card number.')),
    cvc: v.string(),
    note: v.optional(v.string()),
  }),
  { secret: ['card', 'cvc'] },
);

const checkout = (): FormData => {
  const data = new FormData();
  data.append('email', 'ada@example.com');
  data.append('password', 'short');
  data.append('card', '4111111111111111');
  data.append('cvc', '123');
  data.append('note', 'leave at the door');
  return data;
};

describe('secret fields', () => {
  afterEach(() => vi.restoreAllMocks());

  it('are never in a rejection, values() or a client-side form() rejection', async () => {
    const result = Checkout.validate(checkout(), 'Pay');
    if (result instanceof Promise || result.ok) throw new Error('expected a sync rejection');
    const sticky = { email: 'ada@example.com', note: 'leave at the door' };
    expect(result.rejected.values).toEqual(sticky);
    expect(Checkout.values(checkout())).toEqual(sticky);

    const parse = form(Checkout, () => ({ _tag: 'Paid' as const }));
    const input = { name: 'Pay', formData: checkout() } as unknown as IntentInput;
    const parsed = (await parse(input)) as IntentRejected;
    expect(parsed._tag).toBe('IntentRejected');
    expect(parsed.values).toEqual(sticky);
    expect(JSON.stringify(parsed)).not.toMatch(/4111|123|short/);
  });

  it('include password-like names without being listed, also for a bare schema', async () => {
    const Plain = defineForm(v.object({ newPassword: v.pipe(v.string(), v.minLength(99)) }));
    const data = new FormData();
    data.append('newPassword', 'hunter2');
    data.append('passcode', '0000');
    expect(Plain.values(data)).toEqual({});

    const bare = form(Plain.schema, () => ({ _tag: 'Saved' as const }));
    const parsed = (await bare({
      name: 'Save',
      formData: data,
    } as unknown as IntentInput)) as IntentRejected;
    expect(parsed.values).toEqual({});
  });

  it('are known to the devtools redaction', () => {
    expect(Checkout.secret).toEqual(['card', 'cvc']);
    expect(isSecretField('card')).toBe(true);
    expect(isSecretField('confirmPassword')).toBe(true);
    expect(isSecretField('email')).toBe(false);
  });

  it('warn once in development when a field looks secret but is not listed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const Login = defineForm(v.object({ apiToken: v.pipe(v.string(), v.minLength(99)) }));
    const data = new FormData();
    data.append('apiToken', 'abc');
    data.append('shipping', 'express');
    Login.values(data);
    Login.values(data);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('"apiToken"');
  });
});

describe('secret fields outside the schema (gyral-1zd.29)', () => {
  const Login = defineForm(v.object({ handle: v.string(), password: v.string() }), {
    secret: ['handle', 'session_ref'],
  });

  it('accepts any posted field name and still autocompletes schema keys', () => {
    expectTypeOf(Login.secret).toEqualTypeOf<readonly string[]>();
    const data = new FormData();
    data.append('handle', 'ada');
    data.append('password', 'hunter2');
    data.append('session_ref', 'abc');
    data.append('note', 'hi');
    expect(Login.values(data)).toEqual({ note: 'hi' });
  });

  it('never echoes CSRF-named fields, on the client path too', async () => {
    const data = new FormData();
    data.append('email', 'nope');
    data.append('_csrf', 'tok-123');
    data.append('csrfToken', 'tok-456');
    const result = await Contact.validate(data, 'Send');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejected.values).toBeDefined();
    expect(JSON.stringify(result.rejected.values)).not.toMatch(/tok-123|tok-456/);
    expect(isSecretField('_csrf')).toBe(true);
    expect(isSecretField('xsrf-token')).toBe(true);
  });
});
