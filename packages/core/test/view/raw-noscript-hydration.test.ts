// `raw()` markup holding a <noscript> (gyral-uvj.2; view/02-bindings.md "`raw(html)`", view/01
// "Normalization"): a <noscript>'s content is server-only, in templates and in raw() alike. The
// client parses raw() through a <template>, which Chromium and WebKit parse with scripting off,
// so the notice's markup would become live elements (a <style> that applies, an <img> that
// loads); the client empties every <noscript> before inserting the markup. The server writes
// raw() verbatim, the page's parser keeps the notice as text, and hydration adopts it as it is.
// Runs in Chromium, Firefox and WebKit (browsers.config.ts) and against development and
// production builds of core (browser, browser-prod).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from '../../src/server.js';
import { html, hydrate, raw, render } from '../../src/view/index.js';
import { cleanup, container, nodesOf, serverDom } from './hydrate-helpers.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const RED = 'rgb(255, 0, 0)';
// A URL nothing serves: the <img> must never be created in the page.
const IMG = '/never-requested-gyral-uvj-2.png';
const NOTICE =
  '<noscript><style>.raw-ns-probe { color: rgb(255, 0, 0); }</style>' +
  `<img src="${IMG}" alt=""><p>Enable JavaScript</p></noscript>`;
const ARTICLE = `<h2 class="raw-ns-probe">Title</h2>${NOTICE}<div class="note">${NOTICE}</div><p>end</p>`;
const view = (markup: string) => html`<article>${raw(markup)}</article>`;

const notices = (root: ParentNode): Element[] => [...root.querySelectorAll('noscript')];
const color = (root: ParentNode): string => {
  const h2 = root.querySelector('h2');
  if (h2 === null) throw new Error('no <h2>');
  return getComputedStyle(h2).color;
};

describe('raw() markup with a <noscript> (gyral-uvj.2)', () => {
  it('client-renders every <noscript> empty, so its <style> and <img> stay inert', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined); // raw() in the browser
    const root = container();
    render(view(ARTICLE), root);
    expect(notices(root)).toHaveLength(2); // top level and nested
    for (const ns of notices(root)) expect(ns.childNodes).toHaveLength(0);
    expect(root.querySelector('img, style')).toBeNull();
    expect(color(root)).not.toBe(RED);
    expect(root.querySelector('.note')?.nextElementSibling?.textContent).toBe('end');
  });

  it('empties the notices of markup parsed again when the string changes', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const root = container();
    render(view('<p>first</p>'), root);
    render(view(ARTICLE), root);
    for (const ns of notices(root)) expect(ns.childNodes).toHaveLength(0);
    expect(root.querySelector('img, style')).toBeNull();
    expect(color(root)).not.toBe(RED);
    render(view(`${NOTICE}<p>again</p>`), root);
    expect(notices(root)).toHaveLength(1);
    expect(notices(root)[0]?.childNodes).toHaveLength(0);
    expect(root.querySelector('img, style')).toBeNull();
  });

  it('hydrates server output: the notices keep the server text, then re-parse empty', () => {
    const out = renderToString(view(ARTICLE));
    expect(out).toContain(NOTICE); // written verbatim
    const root = serverDom(view(ARTICLE));
    const server = notices(root);
    // The page's parser (scripting on) keeps each notice as one Text node.
    for (const ns of server) expect([...ns.childNodes].map((n) => n.nodeType)).toEqual([3]);
    expect(color(root)).not.toBe(RED);
    const before = nodesOf(root);
    hydrate(view(ARTICLE), root); // no mismatch
    expect(nodesOf(root)).toEqual(before);
    expect(notices(root)).toEqual(server);
    // A change re-parses the markup on the client: its notices are empty.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(view(`${NOTICE}<p>changed</p>`), root);
    expect(notices(root)).toHaveLength(1);
    expect(notices(root)[0]?.childNodes).toHaveLength(0);
    expect(root.querySelector('img, style')).toBeNull();
  });
});
