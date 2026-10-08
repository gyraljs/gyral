import { afterEach, describe, expect, it, vi } from 'vitest';
import * as v from 'valibot';
import {
  define,
  defineForm,
  fieldErrors,
  form,
  html,
  redirectedTo,
  settled,
  type IntentRejected,
} from '@gyral/core';
import { csrfFromMeta, makeHttpDriver, submitForm } from '../src/index.js';

const Login = defineForm(
  v.object({
    email: v.pipe(v.string(), v.email('Bad email')),
    password: v.pipe(v.string(), v.minLength(4, 'Too short')),
  }),
);

interface State {
  readonly errors: Readonly<Record<string, readonly string[]>>;
  readonly done: string | undefined;
  readonly failed: boolean;
}
type Msg =
  | { readonly _tag: 'Login'; readonly form: FormData }
  | { readonly _tag: 'SignedIn'; readonly location: string }
  | { readonly _tag: 'Failed' };

const LoginEl = define<State, Msg>('test-submit-login', {
  init: () => ({ errors: {}, done: undefined, failed: false }),
  intent: { Login: form(Login, (_data, raw) => ({ _tag: 'Login', form: raw })) },
  update: {
    Login: (s, m) => [
      s,
      [
        submitForm('/login', m.form, {
          onSuccess: (body) => ({ _tag: 'SignedIn', location: redirectedTo(body) ?? '/' }),
          onFailure: () => ({ _tag: 'Failed' }),
        }),
      ],
    ],
    SignedIn: (s, m) => ({ ...s, done: m.location }),
    Failed: (s) => ({ ...s, failed: true }),
    IntentRejected: (s, m: IntentRejected) => ({ ...s, errors: fieldErrors(m.issues) }),
  },
  view: (_s, i) =>
    html`<form data-intent=${i.Login}>
      <input name="email" /><input name="password" /><button>Go</button>
    </form>`,
});

type Answer = () => Response;

async function mount(answer: Answer) {
  const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(answer()));
  const el = new LoginEl();
  el.drivers = {
    http: makeHttpDriver({
      fetch,
      baseUrl: 'https://shop.test/',
      headers: csrfFromMeta('csrf-token'),
    }),
  };
  document.body.append(el);
  await settled();
  const submit = async (email: string, password: string) => {
    const root = el.shadowRoot;
    const set = (name: string, value: string) => {
      const input = root?.querySelector(`input[name=${name}]`);
      if (input instanceof HTMLInputElement) input.value = value;
    };
    set('email', email);
    set('password', password);
    root?.querySelector('form')?.requestSubmit();
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 0));
  };
  return { el, fetch, submit };
}

afterEach(() => {
  document.body.replaceChildren();
  document.head.querySelector('meta[name=csrf-token]')?.remove();
});

describe('submitForm()', () => {
  it('posts the raw FormData with JSON accept and the driver adds the CSRF token', async () => {
    const meta = document.createElement('meta');
    meta.name = 'csrf-token';
    meta.content = 'tok-1';
    document.head.append(meta);
    const { el, fetch, submit } = await mount(() =>
      Response.json({ _tag: 'Redirected', location: '/account' }),
    );
    await submit('a@b.co', 'right');
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://shop.test/login'); // the driver passes the resolved URL string
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('email')).toBe('a@b.co');
    expect(init?.headers).toMatchObject({ accept: 'application/json', 'x-csrf-token': 'tok-1' });
    expect(el.state.done).toBe('/account');
  });

  it('sends a token the app already holds with csrf: { token }', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(Response.json({ _tag: 'Redirected', location: '/' })),
    );
    const driver = makeHttpDriver({ fetch, baseUrl: 'https://shop.test/' });
    const cmd = submitForm('/login', new FormData(), {
      csrf: { token: 'held-1', header: 'x-xsrf' },
      onSuccess: () => undefined,
    });
    await driver.run(cmd.input as never, {
      signal: new AbortController().signal,
      emit: () => undefined,
    });
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-xsrf': 'held-1' });
  });

  it("dispatches the server's 422 IntentRejected to the component's reducer", async () => {
    const { el, submit } = await mount(() =>
      Response.json(
        {
          _tag: 'IntentRejected',
          intent: 'Login',
          issues: [{ path: '', message: 'Wrong email or password.' }],
        },
        { status: 422 },
      ),
    );
    await submit('a@b.co', 'wrong');
    await vi.waitFor(() => {
      expect(el.state.errors).toEqual({ '': ['Wrong email or password.'] });
    });
    expect(el.state.failed).toBe(false);
  });

  it('maps other failures to onFailure', async () => {
    const { el, submit } = await mount(() => new Response('boom', { status: 500 }));
    await submit('a@b.co', 'right');
    await vi.waitFor(() => {
      expect(el.state.failed).toBe(true);
    });
  });

  it('never posts what fails client-side validation', async () => {
    const { el, fetch } = await mount(() => Response.json({}));
    const root = el.shadowRoot;
    const email = root?.querySelector('input[name=email]');
    if (email instanceof HTMLInputElement) email.value = 'nope';
    root?.querySelector('form')?.requestSubmit();
    await new Promise((r) => setTimeout(r, 10));
    expect(fetch).not.toHaveBeenCalled();
    expect(el.state.errors['email']).toEqual(['Bad email']);
  });

  it('ignores a second submit while the first is in flight (exhaust)', async () => {
    let release: (() => void) | undefined;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = () => {
            resolve(Response.json({ _tag: 'Redirected', location: '/a' }));
          };
        }),
    );
    const el = new LoginEl();
    el.drivers = { http: makeHttpDriver({ fetch, baseUrl: 'https://shop.test/' }) };
    document.body.append(el);
    await settled();
    const fd = new FormData();
    el.send({ _tag: 'Login', form: fd });
    el.send({ _tag: 'Login', form: fd });
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });
    release?.();
    await vi.waitFor(() => {
      expect(el.state.done).toBe('/a');
    });
  });
});
