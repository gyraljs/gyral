// A hydration mismatch fails a hydration test (gyral-uvj.3, view/07-hydration.md "Mismatches"):
// since 0.3.10 both builds rebuild the component and keep it working, so nothing throws; what
// `hydrated()` sees is the log, an error in development and a warning in production, and it
// rejects on either. Runs against development and production builds of core (the browser and
// browser-prod projects).
import { afterEach, expect, it, vi } from 'vitest';
import { define, html, settled } from '@gyral/core';
import { development as DEV } from '@gyral/core/internal/server';
import { hydrated, mountSsr, type MountedSsr } from '../src/index.js';

let page: MountedSsr | undefined;
afterEach(() => {
  page?.unmount(); // puts back the console it wrapped: the mock below
  page = undefined;
  vi.restoreAllMocks();
});

type Msg = { readonly _tag: 'Inc' };
define<{ readonly n: number }, Msg>()('test-mismatch-counter', {
  init: () => ({ n: 0 }),
  intent: { Inc: true },
  update: { Inc: (s) => ({ n: s.n + 1 }) },
  view: (s, i) => html`<button data-intent=${i.Inc}>${s.n}</button>`,
});

it('rejects on the mismatch the component recovered from, which then works', async () => {
  // Keep the expected log out of the run's output: mountSsr wraps this mock and still records.
  vi.spyOn(console, DEV ? 'error' : 'warn').mockImplementation(() => undefined);
  // The server wrote a <b> where the view has a <button> (a third party, a stale page).
  page = mountSsr(
    `<test-mismatch-counter data-gyral-seed='{"state":{"n":3},"props":{}}'>` +
      '<template shadowrootmode="open"><b>3</b></template></test-mismatch-counter>',
  );
  await expect(hydrated(page)).rejects.toThrow(
    DEV
      ? /Problems during hydration:\nconsole\.error: gyral: hydration mismatch in <test-mismatch-counter> .*expected <button>, found <b>\..*G0062.*was rendered fresh/
      : /Problems during hydration:\nconsole\.warn: Gyral G0063 test-mismatch-counter .*expected <button>, found <b>/,
  );
  expect(page.problems).toHaveLength(1);
  const host = page.root.querySelector('test-mismatch-counter');
  const button = host?.shadowRoot?.querySelector('button');
  if (!(button instanceof HTMLButtonElement)) throw new Error('not rendered fresh');
  expect(button.textContent).toBe('3'); // resumed from the seed
  button.click();
  await settled();
  expect(button.textContent).toBe('4');
});
