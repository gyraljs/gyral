import { afterEach, describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { z } from 'zod';
import { define, defineForm, fieldErrors, html, settled, validateForm } from '../src/index.js';
import type { IntentRejected } from '../src/index.js';

const Contact = defineForm(v.object({ email: v.pipe(v.string(), v.email('Bad email')) }));

const data = (entries: Record<string, string | File>): FormData => {
  const fd = new FormData();
  for (const [k, val] of Object.entries(entries)) fd.append(k, val);
  return fd;
};

describe('validateForm (shared by form() and the server formAction)', () => {
  it('returns the parsed data for valid input', () => {
    expect(validateForm(Contact, 'Send', data({ email: 'a@b.co' }))).toEqual({
      ok: true,
      data: { email: 'a@b.co' },
    });
  });

  it('returns IntentRejected with issues and the submitted text values (no Files)', () => {
    const file = new File(['x'], 'cv.pdf');
    const result = validateForm(Contact, 'Send', data({ email: 'nope', cv: file }));
    expect(result).toEqual({
      ok: false,
      rejected: {
        _tag: 'IntentRejected',
        intent: 'Send',
        issues: [{ path: 'email', message: 'Bad email' }],
        values: { email: 'nope' },
      },
    });
  });

  it('awaits async schemas', async () => {
    const Async = defineForm(
      z.object({ name: z.string().refine(async (n) => Promise.resolve(n !== 'root'), 'Taken') }),
    );
    await expect(validateForm(Async, 'Join', data({ name: 'root' }))).resolves.toMatchObject({
      ok: false,
      rejected: { issues: [{ path: 'name', message: 'Taken' }] },
    });
  });
});

interface State {
  readonly errors: Readonly<Record<string, readonly string[]>>;
  readonly inits: number;
}
type Msg = { readonly _tag: 'Noop' };

const Seeded = define<State, Msg>('test-initial-messages', {
  init: () => ({ errors: {}, inits: 1 }),
  intent: {},
  update: {
    Noop: (s) => s,
    IntentRejected: (s, m) => ({ ...s, errors: fieldErrors(m.issues) }),
  },
  view: (s) => html`<p>${s.errors['email']?.join(' ') ?? ''}</p>`,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('initialMessages', () => {
  it('runs messages through update after init, before the first render', async () => {
    const rejected: IntentRejected = {
      _tag: 'IntentRejected',
      intent: 'Send',
      issues: [{ path: 'email', message: 'Bad email' }],
    };
    const el = new Seeded();
    el.initialMessages = [rejected];
    document.body.append(el);
    await settled();
    expect(el.state).toEqual({ errors: { email: ['Bad email'] }, inits: 1 });
    expect(el.shadowRoot?.querySelector('p')?.textContent).toBe('Bad email');
  });
});
