# Testing

Two layers, both with Vitest:

1. **The model, without a DOM** (fast, the bulk of tests): `step`, `run`, `initial` feed
   messages through the spec's pure `update` and return state plus the commands it asked for.
   Assert on commands as data; resolve them by hand.
2. **The element, in a real browser** (Vitest browser mode with Playwright, never jsdom):
   mount it, swap drivers for fakes, click and type, assert on the DOM.

Vite/Vitest config: spread `gyralVitePreset()` (from `@gyral/core/vite`) into each project.

## Model tests

```ts
import { describe, expect, it } from 'vitest';
import { define, html } from '@gyral/core';
import { get, http } from '@gyral/http';
import { initial, inputsFor, resolve, run, step } from '@gyral/testing';

interface State {
  readonly query: string;
  readonly hits: readonly string[];
}
type Msg =
  | { readonly _tag: 'Typed'; readonly query: string }
  | { readonly _tag: 'Hits'; readonly hits: readonly string[] };

const Search = define<State, Msg>('test-search', {
  init: () => ({ query: '', hits: [] }),
  intent: { Typed: ({ value }) => ({ _tag: 'Typed', query: value ?? '' }) },
  update: {
    Typed: (s, m) => [
      { ...s, query: m.query },
      [
        get<{ readonly hits: readonly string[] }, Msg>(`/api?q=${m.query}`, {
          onSuccess: (body) => ({ _tag: 'Hits', hits: body.hits }),
        }),
      ],
    ],
    Hits: (s, m) => ({ ...s, hits: m.hits }),
  },
  view: (s, i) => html`<input value=${s.query} data-intent=${i.Typed} />`,
});

describe('search model', () => {
  it('starts empty', () => {
    expect(initial(Search.spec).state).toEqual({ query: '', hits: [] });
  });

  it('asks for results when typing, and shows them', () => {
    const typed = step(Search.spec, { query: '', hits: [] }, { _tag: 'Typed', query: 'gyral' });
    expect(inputsFor(typed.commands, http)).toEqual([{ url: '/api?q=gyral' }]);
    // Simulate the driver: what message would this response produce?
    const [command] = typed.commands;
    if (command === undefined) throw new Error('expected a command');
    const msg = resolve(command, { hits: ['gyral', 'gyral-ssr'] });
    expect(msg).toEqual({ _tag: 'Hits', hits: ['gyral', 'gyral-ssr'] });
  });

  it('folds a sequence of messages', () => {
    const { state, states } = run(Search.spec, [
      { _tag: 'Typed', query: 'a' },
      { _tag: 'Hits', hits: ['a1'] },
    ]);
    expect(state.hits).toEqual(['a1']);
    expect(states).toHaveLength(2);
  });
});
```

- `step(spec, state, msg, props?, stores?)`, `run(spec, msgs, { props?, stores?, state? })`,
  `initial(spec, props?)`. Framework messages (`PropsChanged`, `IntentRejected`,
  `StoreChanged`) work too.
- `commandsFor(commands, driver)` / `inputsFor(commands, driver)` filter by driver name;
  `resolve(command, output)` / `reject(command, error)` give the resulting message.
- Stores: `stepStore(store, state, msg)`, `testStore(store, initial?)` (an instance to pass in
  `stores`), `sentTo(commands, store)` (messages a reducer sends to a store).
- Pure update functions make property tests easy: `@gyral/testing/arbitraries` builds
  fast-check arbitraries.

## Element tests (browser)

```ts
import { afterEach, expect, it, vi } from 'vitest';
import { define, html, settled } from '@gyral/core';
import { get } from '@gyral/http';
import { fakeHttp } from '@gyral/http/testing';

interface State {
  readonly name: string;
}
type Msg = { readonly _tag: 'Load' } | { readonly _tag: 'Got'; readonly name: string };

const Who = define<State, Msg>('test-who', {
  init: () => ({ name: '' }),
  intent: { Load: () => ({ _tag: 'Load' }) },
  update: {
    Load: (s) => [
      s,
      [
        get<{ readonly name: string }, Msg>('/api/me', {
          onSuccess: (b) => ({ _tag: 'Got', name: b.name }),
        }),
      ],
    ],
    Got: (_s, m) => ({ name: m.name }),
  },
  view: (s, i) =>
    html`<button type="button" data-intent=${i.Load}>Load</button> <output>${s.name}</output>`,
});

afterEach(() => {
  document.body.replaceChildren();
});

it('loads the user when clicked', async () => {
  const api = fakeHttp(); // requests wait until the test answers them
  const el = new Who();
  el.drivers = { http: api };
  document.body.append(el);
  await settled();

  el.shadowRoot?.querySelector('button')?.click();
  await vi.waitFor(() => {
    expect(api.requests.map((r) => r.url)).toEqual(['/api/me']);
  });
  api.respondNext({ body: { name: 'Ada' } });
  await vi.waitFor(() => {
    expect(el.shadowRoot?.querySelector('output')?.textContent).toBe('Ada');
  });
});
```

- `await settled()` (from `@gyral/core`) waits until every component has rendered and messages
  have stopped arriving: child props, outputs reaching parents, focus commands, view
  transitions, and chains of messages a few microtasks apart (a stream re-arming in a
  microtask, a store notifying in one, a driver that answers at once) included. Commands that
  never end (a store watch, a socket) don't block it; it never waits for timers or the network:
  answer fakes, `vi.waitFor` or `time.advance(…)` first, then `await settled()`. No
  `await Promise.resolve()` loops before it.
- `fakeDriver(driverOrName, { impl? })` records any driver's calls: `calls`, `inputs`,
  `resolveNext(output)`, `rejectNext(error)`, `emitNext(output)` (streaming); each call has its
  `signal`, so you can assert that `switch` aborted it.
- Removing an element interrupts its commands **synchronously**: right after `el.remove()`,
  every running call's `signal.aborted` is `true` and its `abort` listeners have run; assert
  without yielding. Only cleanup a driver runs after an `await` needs a yield
  (`await Promise.resolve()`).
- `fakeHttp({ respond? })` (from `@gyral/http/testing`) runs the real HTTP driver against a
  fake `fetch`, so schemas and error mapping are exercised: `respondNext`,
  `reply(status, body)`, `failNext()`.
- `withDrivers(container, { http: fake })` provides fakes to every component below a container.
- `virtualTime()` fakes timers: `await time.advance(500)`, `time.runAll()`, `time.restore()`.
- Dispatch input events as the browser does: set `input.value`, then
  `input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))`.

## SSR tests

`hydrated(page, { releaseIslands? })` releases islands if asked, then awaits `settled()`; it
fails on console errors and warnings (a hydration mismatch is one) and on elements that never
upgraded. Run SSR tests against production builds of core too: mismatches are reported
differently there (a warning and a fresh render instead of an error).

```ts
import { expect, it } from 'vitest';
import { hydrated, mountSsr } from '@gyral/testing';

it('hydrates the server page in place with no console problems', async () => {
  const response = await fetch('/'); // or call your app's fetch handler directly
  const page = mountSsr(await response.text());
  const before = page.root.querySelector('my-home');
  await hydrated(page);
  expect(page.root.querySelector('my-home')).toBe(before); // same node: no re-render
  expect(page.problems).toEqual([]);
  page.unmount();
});
```

`mountSsr(html)` parses a server document (Declarative Shadow DOM included) into the test page;
`hydrated(page)` waits until every component has hydrated and fails on undefined elements.
Server-only tests (status codes, markup, `formAction`) run in Node by calling the app's `fetch`
handler with a `Request`.
