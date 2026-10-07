// Client-only builds (gyralVitePreset({ clientOnly: true }), view/07-hydration.md "Client-only
// builds", gyral-c5d.11), run by the `browser-client-only` Vitest project: core resolves
// `#hydration-loader` to hydration-off.ts. Server-rendered markup met anyway renders fresh,
// never doubled; development warns once.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hydrationCode } from '#hydration-loader';
import { define, html, settled } from '../src/index.js';
import { SEED_ATTRIBUTE } from '../src/hydration.js';

interface State {
  readonly text: string;
}

const spec = {
  init: () => ({ text: 'client' }),
  intent: {},
  update: {},
  view: (s: State) => html`<p>${s.text}</p>`,
};
define<State, never>('test-co-shadow', spec);
define<State, never>('test-co-light', { ...spec, shadow: false });
define<State, never>('test-co-plain', spec);

const seed = `${SEED_ATTRIBUTE}='{"state":{"text":"server"},"props":{}}'`;

/** Parses server markup (declarative shadow DOM included) into the document. */
function serverMarkup(markup: string): HTMLElement {
  const host = document.createElement('div');
  host.setHTMLUnsafe(markup);
  document.body.append(host);
  return host;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('client-only builds', () => {
  it('carry no hydration code', async () => {
    const warn = vi.spyOn(console, 'warn');
    document.body.append(document.createElement('test-co-plain'));
    await settled();
    expect(hydrationCode).toBeNull();
    expect(document.querySelector('test-co-plain')?.shadowRoot?.textContent).toBe('client');
    expect(warn).not.toHaveBeenCalled();
  });

  it('render server-rendered hosts fresh, shadow and light, warning once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const host = serverMarkup(
      `<test-co-shadow ${seed}><template shadowrootmode="open"><style>p{}</style>` +
        `<p>server</p></template></test-co-shadow>` +
        `<test-co-light ${seed} data-gyral-light><p>server</p></test-co-light>`,
    );
    await settled();
    const shadow = host.querySelector('test-co-shadow');
    const light = host.querySelector('test-co-light');
    // init's state, not the seed's; the server's nodes are replaced, never doubled.
    expect(shadow?.shadowRoot?.innerHTML).not.toContain('server');
    expect(shadow?.shadowRoot?.querySelectorAll('p').length).toBe(1);
    expect(shadow?.shadowRoot?.textContent).toBe('client');
    expect(light?.querySelectorAll('p').length).toBe(1);
    expect(light?.textContent).toBe('client');
    expect(shadow?.hasAttribute(SEED_ATTRIBUTE)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/server-rendered.*clientOnly/s);
  });

  it('start defer-hydration islands at once', async () => {
    const host = serverMarkup(
      `<test-co-plain defer-hydration data-gyral-hydrate="visible"></test-co-plain>`,
    );
    await settled();
    expect(host.querySelector('test-co-plain')?.shadowRoot?.textContent).toBe('client');
  });
});
