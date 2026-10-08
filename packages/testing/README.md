# @gyral/testing

Gyral test helpers: step pure updates, inspect commands, fake drivers, virtual time, mount server-rendered pages, and generate inputs from schemas. Works with any test runner; examples use Vitest.

## Install

```sh
pnpm add -D @gyral/testing
```

## Example

```ts
import { expect, test } from 'vitest';
import { step } from '@gyral/testing';
import { Counter } from '../src/counter.js';

test('increment', () => {
  expect(step(Counter.spec, { count: 1 }, { _tag: 'Increment' }).state).toEqual({ count: 2 });
});
```

Commands are data: `inputsFor(commands, driver)` lists a driver's inputs,
`outputsIn(commands, Component)` the outputs sent to the parent (typed by the component's
output union) and `focusTargetsIn(commands)` the `focus()` requests.

Element tests run in a real browser (Vitest browser mode, not jsdom): mount the element,
dispatch events, then `await settled()` (from `@gyral/core`) before you check the DOM: it
waits until every component has rendered and messages have stopped arriving (streams that
never end don't block it; timers are yours to advance). Swap
drivers for fakes with `fakeDriver` and `withDrivers`; `mountSsr` and `hydrated` test
server-rendered pages through hydration (below).

```ts
import { defineDriver } from '@gyral/core';
import { fakeDriver, withDrivers } from '@gyral/testing';

const urls: (string | null)[] = [];
el.drivers = {
  'saved-query': defineDriver<undefined, string | null>({
    name: 'saved-query',
    run: () => 'gyral',
  }),
  // fakeDriver(name, run) answers every call with run and records the inputs.
  'url-sync': fakeDriver<string | null, undefined>('url-sync', (query) => void urls.push(query)),
  clipboard: fakeDriver<string, undefined, string>('clipboard'), // waits for resolveNext()
};
withDrivers(container, { 'saved-query': fakeDriver('saved-query', () => null) }); // a subtree
```

Drivers need no cast in `el.drivers`, `withDrivers` or `provideDrivers`: any
`Driver<I, O, E>` (typed input, output and error, `toError`, `retry`, a `subscription`, a fake)
is assignable to `AnyDriver`. Type your own driver maps as `DriverOverrides` from
`@gyral/core`; `Record<string, Driver<unknown, unknown>>` rejects drivers with typed inputs.

## Server-rendered pages: hydration tests

A hydration test mounts real server markup with `mountSsr(html)`, imports the component modules
so they upgrade and hydrate in place, then `await hydrated(page)`: it fails on a hydration
mismatch, on console errors or warnings, and on server-rendered elements that never upgraded.
The browser can't produce that markup itself (in the browser `define()` registers elements
instead of server specs, and client builds drop the server half of templates), so it comes
from Node in one of two ways.

**On demand: `renderOnServer`** (Vitest browser mode). `@gyral/testing/vitest` is a Vitest
[browser command](https://vitest.dev/api/browser/commands): it runs in Vitest's Node process,
loads your module through the project's Vite server (same plugins and preset, development
build of core) and renders it with `@gyral/core/server`. Install `vitest` 4.1 or 5 (an optional peer)
and register it:

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

```ts
// test/counter-hydration.test.ts (runs in the browser)
import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { settled } from '@gyral/core';
import { hydrated, mountSsr } from '@gyral/testing';

it('hydrates the server markup in place and stays interactive', async () => {
  const html = await commands.renderOnServer({
    module: '../src/counter.ts', // relative to this test file
    export: 'Counter', // a define() class, a function of props, or a template result
    props: { start: 3 },
  });
  const page = mountSsr(html);
  const host = page.root.querySelector('my-counter');
  const button = host?.shadowRoot?.querySelector('button');
  await import('../src/counter.js'); // after mounting, as on a page load
  await hydrated(page);
  expect(host?.shadowRoot?.querySelector('button')).toBe(button); // same node: adopted
  button?.click();
  await settled();
  expect(host?.shadowRoot?.querySelector('output')?.textContent).toBe('4');
  page.unmount();
});
```

- `export` (default `'default'`) names a `define()` class (its element is rendered with
  `props` set as properties), a function (called with `props`; it may return or resolve to a
  template result, an HTML string or a `Response`, e.g. from `@gyral/ssr`'s `renderPage` or
  your app's `fetch` handler, so a whole page with its store seed works too) or a template
  result. `props` travel from the browser, so they must be JSON. `dev: false` renders
  production markup (default: development, as Vitest resolves core).
- The server keeps modules loaded between calls, like a dev server: module-level state carries
  over, so pass what a render needs through `props`. The first call loads the module graph
  (core's server renderer included), which can take seconds in a busy parallel run: give those
  tests a longer timeout (`describe('…', { timeout: 60_000 }, …)`).
- Types: the command's types come with `@gyral/testing/vitest`. If your tsconfig doesn't
  include `vitest.config.ts`, add `import type {} from '@gyral/testing/vitest';` to the test.

**Golden fixture.** A Node test (`*.node.test.ts`) calls your real server and writes the HTML
with `await expect(html).toMatchFileSnapshot('./fixtures/about.ssr.html')`; the browser test
imports it (`import serverHtml from './fixtures/about.ssr.html?raw'`) and mounts it. Regenerate
with `vitest -u` and review the diff.

| Use `renderOnServer` when…                                   | Use a golden fixture when…                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| testing a component or a page you can render from one module | the markup comes from the whole server (routing, data loading, headers, a built server) |
| each test wants different props or state                     | you want markup changes reviewed in diffs, or a page shared by many tests               |
| you want no files to keep in sync                            | tests run outside Vitest browser mode, or the server needs services Vite can't load     |

Both feed the same `mountSsr` / `hydrated` assertions; run hydration tests against production
builds of core too (a mismatch there warns and re-renders instead of throwing).

`@gyral/testing/arbitraries` derives [fast-check](https://fast-check.dev) arbitraries from schemas (install `fast-check` to use it).

## Documentation

Guides and API reference: **[gyral.dev](https://gyral.dev)**. Source, issues and the
consumer setup guide (packages, Vite preset, server rendering):
[github.com/gyraljs/gyral](https://github.com/gyraljs/gyral). Upgrading from 0.2:
[docs/references/migrating-0.2-to-0.3.md](https://github.com/gyraljs/gyral/blob/main/docs/references/migrating-0.2-to-0.3.md).

> Status: pre-alpha. APIs change between 0.x releases.

## License

MIT © Mike Zupper. See LICENSE and NOTICE (Cycle.js attribution). Gyral, gyraljs and
the Gyral logo are trademarks of Mike Zupper.
