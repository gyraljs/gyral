// Naming traps in production (browser-prod project, gyral-k97.5): a prop named like a built-in
// property still warns with its code (G0023). Gyral's own member names (`state`, `send`, …)
// and lowercased attributes (G0024) are development checks, backed by the prop types and
// template rule 16, so production bundles don't carry them.
import { expect, it, vi } from 'vitest';
import { define, html, prop, settled } from '../src/index.js';
import { DEV } from '../src/view/index.js';

it.runIf(!DEV)(
  "warns about a built-in's name, and leaves Gyral's checks to development",
  async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      define()('test-prod-hidden', {
        // @ts-expect-error -- hidden is HTMLElement's
        props: { hidden: prop.boolean() },
        view: () => html``,
      });
      expect(warn.mock.calls).toEqual([
        ['Gyral G0023 test-prod-hidden hidden https://gyral.dev/errors/#G0023'],
      ]);
      define()('test-prod-camel', {
        props: { playerBase: prop.number() },
        view: () => html``,
      });
      document.body.innerHTML = '<test-prod-camel playerbase="7"></test-prod-camel>';
      await settled();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
      document.body.replaceChildren();
    }
  },
);
