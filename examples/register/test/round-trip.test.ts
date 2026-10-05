import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeHttpDriver } from '@gyral/http';
import '../src/register.js';

const valid = {
  name: 'mike',
  email: 'mike@example.com',
  password: 'longenough',
  confirm: 'longenough',
};

async function mount(answer: () => Response) {
  const fetch = vi.fn(() => Promise.resolve(answer()));
  const el = document.createElement('gy-register');
  el.drivers = { http: makeHttpDriver({ fetch, baseUrl: 'http://localhost/' }) };
  document.body.append(el);
  await el.updateComplete;
  const root = el.shadowRoot;
  for (const [name, value] of Object.entries(valid)) {
    const field = root?.querySelector(`input[name=${name}]`);
    if (field instanceof HTMLInputElement) field.value = value;
  }
  root?.querySelector('form')?.requestSubmit();
  return { el, fetch };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('register JS path: the server decides', () => {
  it('posts a client-valid form and shows the welcome after the server accepts it', async () => {
    const { el, fetch } = await mount(() =>
      Response.json({ _tag: 'Redirected', location: '/?welcome=mike' }),
    );
    await vi.waitFor(() => {
      expect(el.state.welcome).toBe('mike');
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shows the server's rejection through the same reducer as client errors", async () => {
    const { el } = await mount(() =>
      Response.json(
        {
          _tag: 'IntentRejected',
          intent: 'Register',
          issues: [{ path: 'email', message: 'That email is already registered.' }],
        },
        { status: 422 },
      ),
    );
    await vi.waitFor(() => {
      expect(el.state.errors).toEqual({ email: ['That email is already registered.'] });
    });
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('#email-error')?.textContent).toBe(
      'That email is already registered.',
    );
    expect(el.state.welcome).toBeUndefined();
  });
});
