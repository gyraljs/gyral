import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { defineForm, redirectedTo, type IntentRejected } from '@gyral/core';
import { formAction, rejectWith, seeOther } from '../src/index.js';

const Login = defineForm(
  v.object({
    email: v.pipe(v.string(), v.email('Bad email')),
    password: v.pipe(v.string(), v.minLength(4, 'Too short')),
  }),
);

const seen: IntentRejected[] = [];
const handle = formAction(Login, {
  intent: 'Login',
  valid: (data) => {
    if (data.password !== 'right') return rejectWith('Wrong email or password.');
    const res = seeOther('/account');
    res.headers.append('set-cookie', 'sid=abc; HttpOnly');
    return res;
  },
  invalid: (rejected) => {
    seen.push(rejected);
    return new Response('<p>errors</p>', { status: 422, headers: { 'content-type': 'text/html' } });
  },
});

// What submitForm sends: the FormData itself, asking for JSON.
const submit = (fields: Record<string, string>, accept = 'application/json') => {
  const body = new FormData();
  for (const [k, val] of Object.entries(fields)) body.set(k, val);
  return handle(new Request('http://x/', { method: 'POST', body, headers: { accept } }));
};

describe('formAction answering the JS path with JSON', () => {
  it('turns a redirect into 200 { _tag: Redirected } and keeps its cookies', async () => {
    const res = await submit({ email: 'a@b.co', password: 'right' });
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('set-cookie')).toContain('sid=abc');
    expect(redirectedTo(await res.json())).toBe('/account');
  });

  it('answers schema failures with 422 JSON, without echoing submitted values', async () => {
    const res = await submit({ email: 'nope', password: 'secret-pass' });
    expect(res.status).toBe(422);
    const body: unknown = await res.json();
    expect(body).toEqual({
      _tag: 'IntentRejected',
      intent: 'Login',
      issues: [{ path: 'email', message: 'Bad email' }],
    });
    expect(JSON.stringify(body)).not.toContain('secret-pass');
  });

  it('answers server-only rejections (rejectWith) the same way', async () => {
    const res = await submit({ email: 'a@b.co', password: 'wrong' });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      _tag: 'IntentRejected',
      intent: 'Login',
      issues: [{ path: '', message: 'Wrong email or password.' }],
    });
  });

  it('still renders HTML for a browser form post, including rejectWith', async () => {
    const res = await submit({ email: 'a@b.co', password: 'wrong' }, 'text/html,*/*');
    expect(res.status).toBe(422);
    expect(await res.text()).toContain('errors');
    expect(seen.at(-1)).toMatchObject({
      intent: 'Login',
      issues: [{ path: '', message: 'Wrong email or password.' }],
      values: { email: 'a@b.co', password: 'wrong' },
    });
    const ok = await submit({ email: 'a@b.co', password: 'right' }, 'text/html');
    expect(ok.status).toBe(303);
  });
});
