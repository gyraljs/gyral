import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { defineForm, type IntentRejected } from '@gyral/core';
import { formAction, seeOther } from '../src/index.js';

const Signup = defineForm(
  v.objectAsync({
    email: v.pipe(v.string(), v.email('Bad email')),
    name: v.pipeAsync(
      v.string(),
      v.checkAsync(async (n) => Promise.resolve(n !== 'admin'), 'Taken'),
    ),
  }),
);

const seen: IntentRejected[] = [];
const handle = formAction(Signup, {
  intent: 'Signup',
  valid: (data) => seeOther(`/welcome/${data.name}`),
  invalid: (rejected) => {
    seen.push(rejected);
    return new Response('errors', { status: 422 });
  },
});

const post = (fields: Record<string, string>) =>
  handle(new Request('http://x/', { method: 'POST', body: new URLSearchParams(fields) }));

describe('formAction', () => {
  it('redirects valid submissions with 303', async () => {
    const res = await post({ email: 'a@b.co', name: 'mike' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/welcome/mike');
  });

  it('hands the same IntentRejected as the client path to `invalid`', async () => {
    const res = await post({ email: 'nope', name: 'admin' });
    expect(res.status).toBe(422);
    expect(seen.at(-1)).toEqual({
      _tag: 'IntentRejected',
      intent: 'Signup',
      issues: [
        { path: 'email', message: 'Bad email' },
        { path: 'name', message: 'Taken' },
      ],
      values: { email: 'nope', name: 'admin' },
    });
  });

  it('accepts multipart bodies', async () => {
    const body = new FormData();
    body.append('email', 'a@b.co');
    body.append('name', 'zoe');
    const res = await handle(new Request('http://x/', { method: 'POST', body }));
    expect(res.headers.get('location')).toBe('/welcome/zoe');
  });

  it('answers 415 when the body is not a form', async () => {
    const res = await handle(
      new Request('http://x/', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(415);
  });
});
