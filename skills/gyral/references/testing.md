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
- `outputsIn(commands, Component)` returns the outputs a reducer sent to the parent (`emit`,
  `outputs<O>()`), typed by the class's output union (or `outputsIn<Out>(commands)`).
  `focusTargetsIn(commands)` returns each `focus()` request as
  `{ selector, preventScroll?, select? }`. Never filter on driver names such as
  `'@gyral/emit'`: they are core internals.
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
  `signal`, so you can assert that `switch` aborted it. `fakeDriver(name, run)` answers every
  call with `run`: `fakeDriver<string | null, undefined>('url-sync', (query) => void urls.push(query))`.
- Drivers and fakes need **no cast** anywhere drivers are substituted (`el.drivers`,
  `withDrivers`, `provideDrivers`): any `Driver<I, O, E>`, from `defineDriver`, `subscription`
  or `fakeDriver`, is assignable to `AnyDriver`. Never write `as AnyDriver`. Type a driver map
  as `DriverOverrides` (or `Record<string, AnyDriver>`), not
  `Record<string, Driver<unknown, unknown>>`, which rejects drivers with a typed input.
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

## SSR tests (hydration)

A hydration test mounts real server markup (`mountSsr(html)`), imports the component modules so
they upgrade and hydrate in place, then `await hydrated(page)`. `hydrated` releases islands if
asked (`{ releaseIslands: true }`), then awaits `settled()`; it fails on console errors and
warnings (a hydration mismatch is one) and on elements that never upgraded.

The browser can't render that markup itself: there `define()` registers custom elements instead
of server specs, and client builds drop the server half of compiled templates. Get it from
Node, one of two ways:

1. **`renderOnServer`** (Vitest browser mode, from `@gyral/testing/vitest`; needs `vitest` 5): a
   Vitest browser command that runs in Vitest's Node process, loads a module through the
   project's Vite server (same preset, development build) and renders it with
   `@gyral/core/server`. Use it for component and page hydration tests: no files to sync,
   props per test.
2. **Golden fixture:** a Node test (`*.node.test.ts`) calls the real server and writes the
   HTML with `toMatchFileSnapshot('./fixtures/page.ssr.html')`; the browser test imports it with
   `?raw`. Use it when the markup needs the whole server stack (routing, data loading, page
   shell, a built server), when markup changes should be reviewed in diffs, or outside Vitest
   browser mode. Regenerate with `vitest -u`.

Register the command (spread the preset into each Vitest project as usual):

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { gyralVitePreset } from '@gyral/core/vite';
import { renderOnServer } from '@gyral/testing/vitest';

export default defineConfig({
  ...gyralVitePreset(),
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      commands: { renderOnServer },
    },
  },
});
```

```text
// test/counter-hydration.test.ts (browser); src/counter.ts exports `Counter` (define()).
import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { settled } from '@gyral/core';
import { hydrated, mountSsr } from '@gyral/testing';

it('hydrates the server markup in place and stays interactive', async () => {
  const page = mountSsr(
    await commands.renderOnServer({
      module: '../src/counter.ts', // relative to the test file
      export: 'Counter',
      props: { start: 3 },
    }),
  );
  const host = page.root.querySelector('my-counter');
  const button = host?.shadowRoot?.querySelector('button');
  await import('../src/counter.js'); // after mounting, as on a page load
  await hydrated(page);
  expect(host?.shadowRoot?.querySelector('button')).toBe(button); // adopted, not re-rendered
  button?.click();
  await settled();
  expect(host?.shadowRoot?.querySelector('output')?.textContent).toBe('4');
  page.unmount();
});
```

- `export` (default `'default'`): a `define()` class (rendered with `props` as properties), a
  function of `props` returning (or resolving to) a template result, an HTML string or a
  `Response` (`renderPage(…)` from `@gyral/ssr`, an app's `fetch`: whole pages with store seeds),
  or a template result. `props` must be JSON. `dev: false` renders production markup.
- Server modules stay loaded between calls (like a dev server): pass per-test data as props.
  The first call loads the module graph and can take seconds under a parallel run: give those
  tests a longer timeout (`{ timeout: 60_000 }`).
- Types come with `@gyral/testing/vitest`; when the tsconfig doesn't include
  `vitest.config.ts`, add `import type {} from '@gyral/testing/vitest';` to the test.
- Don't `fetch('/')` from a browser test for server markup: that reaches Vitest's own server,
  not your app.
- Run hydration tests against production builds of core too (a Vitest project with
  `resolve: { conditions: ['module', 'browser', 'production'] }`): a mismatch there warns and
  re-renders that component instead of throwing.

`mountSsr(html, { stores?, metas? })` parses a server document or fragment (Declarative Shadow
DOM included) into the test page, restoring the store seed and named `<meta>`s. Server-only
tests (status codes, markup, `formAction`) run in Node by calling the app's `fetch` handler with
a `Request`.
