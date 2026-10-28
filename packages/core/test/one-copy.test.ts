// A second copy of core in one page (gyral-k97.2): a value one copy makes, such as a css``
// style, fails in the other far from the cause. In development, in browsers, each copy
// registers on the page and a second one warns once (G0015), naming both versions and URLs.
import { expect, it, vi } from 'vitest';
import { css, define, html } from '../src/index.js';
import { VERSION } from '../src/view/version.js';

interface Copy {
  readonly version: string;
  readonly url: string;
}
const KEY = Symbol.for('gyral.core');
const copies = (): readonly Copy[] | undefined => (globalThis as { [KEY]?: Copy[] })[KEY];

/** Core's module that registers its copy, loaded again under another URL: a second copy. */
const SECOND = new URL('../src/view/message.ts?copy=2', import.meta.url).href;

it('registers the one copy this page loads, without a warning', () => {
  // A component, so the page runs core for real.
  define()('one-copy-probe', { init: () => ({}), view: () => html`<p>one</p>`, styles: css`` });
  expect(copies()).toEqual([
    { version: VERSION, url: expect.stringContaining('/src/view/message.ts') as string },
  ]);
  expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
});

it('warns once when a second copy loads, naming both', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    await import(/* @vite-ignore */ SECOND);
    await import(/* @vite-ignore */ SECOND); // the same copy again: no new warning
    const first = copies()?.[0];
    if (first === undefined) throw new Error('the first copy is not registered');
    expect(copies()).toEqual([first, { version: VERSION, url: SECOND }]);
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0]?.[0]);
    expect(text).toContain(
      `Two copies of @gyral/core run in this page: ${VERSION} from ${first.url}`,
    );
    expect(text).toContain(`and ${VERSION} from ${SECOND}`);
  } finally {
    warn.mockRestore();
  }
});
