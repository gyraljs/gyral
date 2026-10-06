import { describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { page, renderToString } from '../src/index.js';
import { counter } from './support/islands.js';

const body = html`
  <test-island-load></test-island-load>
  <test-island-idle></test-island-idle>
  <test-island-interaction></test-island-interaction>
  <test-island-store></test-island-store>
  <test-island-parent></test-island-parent>
  <test-island-host></test-island-host>
  <div style="block-size: 300vh"></div>
  <test-island-visible></test-island-visible>
`;

describe('lazy hydration islands on the server (gyral-4k7.4)', () => {
  it('marks deferred islands with defer-hydration and their strategy', async () => {
    const stores = [counter.instance({ n: 41 })];
    const out = await renderToString(page({ title: 'Islands', body, stores }), { stores });
    for (const strategy of ['idle', 'visible', 'interaction']) {
      expect(out).toMatch(
        new RegExp(
          `<test-island-${strategy}[^>]*defer-hydration[^>]*data-gyral-hydrate="${strategy}"`,
        ),
      );
    }
    expect(out).not.toMatch(/<test-island-load[^>]*data-gyral-hydrate/);
    // An island's nested component isn't deferred: it hydrates on its own (view/07 "Islands").
    expect(out).toMatch(/<test-island-load class="nested" data-gyral-seed='\{"props":\{\}\}'>/);
    // Islands may sit anywhere (07): one inside a component's shadow root keeps its deferral.
    expect(out).toMatch(
      /<test-island-interaction class="inner" data-gyral-seed='[^']*' defer-hydration data-gyral-hydrate="interaction">/,
    );
    expect(out).toContain('41'); // the store island renders its seeded store on the server
    // Golden file for islands-hydration.test.ts (update with `pnpm test -u`).
    await expect(out).toMatchFileSnapshot('./fixtures/islands.ssr.html');
  });
});
