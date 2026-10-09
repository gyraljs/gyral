// The hydration code loads lazily (view/07-hydration.md "Loading"): a client-only page never
// imports it; the first host with a seed (or `defer-hydration`) does, and settled() waits.
// Its own file: the module state it checks is per test file.
import { afterEach, describe, expect, it } from 'vitest';
import { define, html, settled } from '../src/index.js';
import { SEED_ATTRIBUTE } from '../src/hydration.js';
import * as hydration from '../src/hydration-loader.js';

interface State {
  readonly text: string;
}

const Plain = define<State, never>()('test-load-plain', {
  init: () => ({ text: 'client' }),
  intent: {},
  update: {},
  view: (s) => html`<p>${s.text}</p>`,
});

const Seeded = define<State, never>()('test-load-seeded', {
  init: () => ({ text: 'init' }),
  intent: {},
  update: {},
  view: (s) => html`<p>${s.text}</p>`,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('loading the hydration code', () => {
  it('is not loaded by client-only hosts', async () => {
    document.body.append(new Plain());
    await settled();
    expect(hydration.hydrationCode).toBeUndefined();
    expect(document.querySelector('test-load-plain')?.shadowRoot?.textContent).toBe('client');
  });

  it('loads with the first seeded host; the host resumes at once and hydrates once loaded', async () => {
    const host = document.createElement('div');
    host.setHTMLUnsafe(
      `<test-load-seeded ${SEED_ATTRIBUTE}='{"state":{"text":"server"},"props":{}}'>` +
        '<template shadowrootmode="open"><p>server</p></template></test-load-seeded>',
    );
    const p = host.querySelector('test-load-seeded')?.shadowRoot?.querySelector('p');
    document.body.append(host);
    const el = host.querySelector('test-load-seeded') as InstanceType<typeof Seeded>;
    expect(el).toBeInstanceOf(Seeded);
    // The seed is read on connect, before the code arrives: state is the server's, not init's.
    expect(el.state.text).toBe('server');
    expect(hydration.hydrationCode).toBeUndefined();
    await settled();
    expect(hydration.hydrationCode).toBeTypeOf('object');
    // Hydrated in place: the server's node is kept.
    expect(el.shadowRoot?.querySelector('p')).toBe(p);
    expect(el.shadowRoot?.textContent).toBe('server');
  });
});
