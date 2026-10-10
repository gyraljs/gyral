import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { defineForm, type IntentRejected } from '@gyral/core';
import { formAction, rejectWith, seeOther } from '../src/index.js';

// A checkout form: the password and the card fields must never come back to the page.
const Checkout = defineForm(
  v.object({
    email: v.pipe(v.string(), v.email('Enter a valid email address.')),
    password: v.pipe(v.string(), v.minLength(8, 'Use 8 characters or more.')),
    card: v.pipe(v.string(), v.regex(/^\d{16}$/, 'Enter the 16-digit card number.')),
    note: v.optional(v.string()),
  }),
  { secret: ['card'] },
);

const seen: IntentRejected[] = [];
const handle = formAction(Checkout, {
  intent: 'Pay',
  valid: (data) =>
    data.card.startsWith('4000') ? rejectWith('Card declined.') : seeOther('/done'),
  invalid: (rejected) => {
    seen.push(rejected);
    return new Response(JSON.stringify(rejected), { status: 422 });
  },
});

const post = (fields: Record<string, string>, accept = 'text/html') =>
  handle(
    new Request('http://shop.test/pay', {
      method: 'POST',
      headers: { accept },
      body: new URLSearchParams(fields),
    }),
  );

const SECRETS = /hunter2|4111111111111111|4000000000000002|longenough1/;

describe('formAction never echoes secret fields', () => {
  it('no-JS schema failure: sticky email and note, no password or card', async () => {
    await post({ email: 'nope', password: 'hunter2', card: '4111111111111111', note: 'gift' });
    expect(seen.at(-1)?.values).toEqual({ email: 'nope', note: 'gift' });
    expect(JSON.stringify(seen.at(-1))).not.toMatch(SECRETS);
  });

  it('no-JS: CSRF token fields are never echoed, listed or not (gyral-1zd.29)', async () => {
    await post({
      email: 'nope',
      password: 'hunter2',
      card: '4111111111111111',
      _csrf: 'tok-123',
      xsrf_token: 'tok-456',
    });
    expect(seen.at(-1)?.values).toEqual({ email: 'nope' });
    expect(JSON.stringify(seen.at(-1))).not.toMatch(/tok-123|tok-456/);
  });

  it('no-JS server-only rejection (rejectWith): the same', async () => {
    await post({
      email: 'a@b.co',
      password: 'longenough1',
      card: '4000000000000002',
      note: 'gift',
    });
    expect(seen.at(-1)?.issues).toEqual([{ path: '', message: 'Card declined.' }]);
    expect(seen.at(-1)?.values).toEqual({ email: 'a@b.co', note: 'gift' });
    expect(JSON.stringify(seen.at(-1))).not.toMatch(SECRETS);
  });

  it('JS path (JSON 422): no values at all, so no secrets', async () => {
    for (const fields of [
      { email: 'nope', password: 'hunter2', card: '4111111111111111' },
      { email: 'a@b.co', password: 'longenough1', card: '4000000000000002' },
    ]) {
      const res = await post(fields, 'application/json');
      expect(res.status).toBe(422);
      expect(await res.text()).not.toMatch(SECRETS);
    }
  });
});
