import { afterEach, expect, it, vi } from 'vitest';
import { define, html, settled } from '@gyral/core';
import { get, makeHttpDriver, type HttpError } from '../src/index.js';

type Msg =
  | { readonly _tag: 'Load' }
  | { readonly _tag: 'Loaded'; readonly body: unknown }
  | { readonly _tag: 'LoadFailed'; readonly error: HttpError };

const Loader = define<{ readonly status: string }, Msg>()('test-http-loader', {
  init: () => ({ status: 'idle' }),
  intent: { Load: () => ({ _tag: 'Load' }) },
  update: {
    Load: () => [
      { status: 'loading' },
      [
        get('/thing', {
          onSuccess: (body): Msg => ({ _tag: 'Loaded', body }),
          onFailure: (error): Msg => ({ _tag: 'LoadFailed', error }),
        }),
      ],
    ],
    Loaded: (_s, m) => ({ status: `loaded ${JSON.stringify(m.body)}` }),
    LoadFailed: (_s, m) => ({ status: `failed ${m.error._tag}` }),
  },
  view: (s, i) => html`<button data-intent=${i.Load}>Load</button><output>${s.status}</output>`,
});

afterEach(() => {
  document.body.replaceChildren();
});

it.each([
  [Response.json({ n: 1 }), 'loaded {"n":1}'],
  [new Response('', { status: 500 }), 'failed HttpStatusError'],
])('get() runs through the substituted http driver', async (response, expected) => {
  const el = new Loader();
  el.drivers = { http: makeHttpDriver({ fetch: () => Promise.resolve(response) }) };
  document.body.append(el);
  await settled();
  el.shadowRoot?.querySelector('button')?.click();
  await vi.waitFor(() => {
    expect(el.state.status).toBe(expected);
  });
});
