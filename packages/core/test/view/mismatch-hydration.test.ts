// view/07-hydration.md "Mismatches": development checks every node, text, bound attribute and
// template marker and production structure only (node types, local names, text lengths); the
// walk throws a HydrationMismatch naming the component, the template's call site, the path and
// what was expected and found. A host whose DOM doesn't match is rebuilt alone, in both builds
// (0.3.10, gyral-uvj.3): its root is cleared and rendered fresh while its siblings stay
// hydrated. Development logs the mismatch as an error, production as a warning (G0063); neither
// goes through the error channel (ADR 0024).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectErrors } from '../collect-errors.js';
import { define, html, settled } from '../../src/index.js';
import { renderToString } from '../../src/server.js';
import {
  compiled,
  DEV,
  hydrate,
  HydrationMismatch,
  normalize,
  raw,
  render,
  type ChildValue,
} from '../../src/view/index.js';
import { cleanup, container, nodesOf } from './hydrate-helpers.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Hydrates `value` over `markup` (hand-written or edited server output). */
function attempt(markup: string, value: ChildValue): () => void {
  const root = container();
  root.setHTMLUnsafe(markup);
  return () => {
    hydrate(value, root, '<test-host>');
  };
}

const card = (title: string, n: number) =>
  html`<article class="card">
    <h2>${title}</h2>
    <p>Count: ${n}<!-- c --></p>
  </article>`;
const ok = renderToString(card('Hi', 3), { dev: false });

describe('what each build detects', () => {
  it.each([
    [
      'another element',
      ok.replace('<h2>', '<h3>').replace('</h2>', '</h3>'),
      /expected <h2>, found <h3>/,
    ],
    ['a missing node', ok.replace('<!-- c -->', ''), /expected <!-- c -->, found the end of <p>/],
    [
      'an extra node',
      ok.replace('</article>', '<em>x</em></article>'),
      /expected the end of <article>, found <em>/,
    ],
    [
      'text too short',
      ok.replace('Count: 3', 'Count'),
      /expected text "Count: ", found text "Count"/,
    ],
    [
      'an extra node at the end',
      `${ok}<b>extension</b>`,
      /expected the end of the view, found <b>/,
    ],
  ])('structure: %s, in every build', (_name, markup, message) => {
    expect(attempt(markup, card('Hi', 3))).toThrow(HydrationMismatch);
    expect(attempt(markup, card('Hi', 3))).toThrow(message);
  });

  it('names the host, the template call site and the path', () => {
    const strings = ['<ul><li>a</li><li>', '</li></ul>'];
    const value = compiled(normalize(strings, 'src/list.ts:4:7'), ['b']);
    const run = attempt('<ul><li>a</li><li><b>b</b></li></ul>', value);
    const call = DEV
      ? /in <test-host> \(template at src\/list\.ts:4:7\) at ul\[0\] › li\[1\] › b\[0\]/
      : /in <test-host> .*at ul\[0\] › li\[1\] › b\[0\]/;
    expect(run).toThrow(call);
  });

  it('text content and bound attributes: development throws, production checks structure only', () => {
    const text = ok.replace('<h2>Hi</h2>', '<h2>Ho</h2>');
    const attr = renderToString(html`<p class=${'a'}>x</p>`, { dev: false }).replace('"a"', '"b"');
    if (DEV) {
      expect(attempt(text, card('Hi', 3))).toThrow(/expected text "Hi", found text "Ho"/);
      expect(attempt(attr, html`<p class=${'a'}>x</p>`)).toThrow(
        /expected class "a", found "b" on <p>/,
      );
    } else {
      expect(attempt(text, card('Hi', 3))).not.toThrow();
      const root = container();
      root.setHTMLUnsafe(attr);
      const p = (c: string) => html`<p class=${c}>x</p>`;
      hydrate(p('a'), root);
      expect(root.querySelector('p')?.className).toBe('b'); // nothing written
      render(p('c'), root);
      expect(root.querySelector('p')?.className).toBe('c'); // the next change writes
    }
  });

  it('development checks the template marker when present; none is fine', () => {
    const other = renderToString(html`<i>${'x'}</i>`, { dev: true }).replace(/<i>.*/, '');
    const marked = other + renderToString(card('Hi', 3), { dev: false });
    if (DEV) expect(attempt(marked, card('Hi', 3))).toThrow(/expected <!--gyral:\w+-->/);
    else expect(attempt(marked, card('Hi', 3))).not.toThrow();
    expect(attempt(ok, card('Hi', 3))).not.toThrow();
  });

  it("raw() needs its start anchor; a light host can't hold the parent's children", () => {
    expect(attempt('<div><b>x</b></div>', html`<div>${raw('<b>x</b>')}</div>`)).toThrow(
      /raw\(\) start anchor/,
    );
    const light = '<x-light data-gyral-light><p>own</p></x-light>';
    expect(attempt(light, html`<x-light><b>${'mine'}</b></x-light>`)).toThrow(/light host/);
    expect(attempt(light, html`<x-light></x-light>`)).not.toThrow();
  });
});

type Msg = { readonly _tag: 'Inc' };
const counter = {
  init: () => ({ n: 0 }),
  intent: { Inc: true as const },
  update: { Inc: (s: { n: number }) => ({ n: s.n + 1 }) },
  view: (s: { n: number }) => html`<button data-intent="Inc">n ${s.n}</button>`,
};
define<{ n: number }, Msg>()('test-mm-shadow', counter);
define<{ n: number }, Msg>()('test-mm-light', { ...counter, shadow: false });

describe('a host whose server DOM does not match', () => {
  const page = (tag: string, n: number) =>
    `<${tag} data-gyral-seed='{"state":{"n":${String(n)}},"props":{}}'>` +
    (tag.endsWith('light') ? '' : '<template shadowrootmode="open">') +
    `<button data-intent="Inc">n ${String(n)}</button>` +
    (tag.endsWith('light') ? '' : '</template>') +
    `</${tag}>`;

  it('is rebuilt alone in both builds; its siblings hydrate; development logs an error', async () => {
    const collected = collectErrors();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const root = container();
    const broken = page('test-mm-shadow', 2).replace('<button', '<a').replace('</button>', '</a>');
    root.setHTMLUnsafe(
      page('test-mm-shadow', 1) + broken + page('test-mm-light', 3).replace('n 3', 'n 3<i>!</i>'),
    );
    const [good, bad, light] = [...root.children] as (HTMLElement & { state: { n: number } })[];
    const goodNodes = nodesOf(good as Node);
    await settled();
    expect(nodesOf(good as Node)).toEqual(goodNodes); // hydrated in place
    (good?.shadowRoot?.querySelector('button') as HTMLButtonElement).click();
    await settled();
    expect(good?.shadowRoot?.textContent).toBe('n 2');
    // Rendered fresh from the seed, and interactive.
    expect(bad?.shadowRoot?.innerHTML).toBe('<button data-intent="Inc">n 2</button>');
    expect(bad?.state.n).toBe(2);
    expect(light?.innerHTML).toBe('<button data-intent="Inc">n 3</button>');
    (bad?.shadowRoot?.querySelector('button') as HTMLButtonElement).click();
    (light?.querySelector('button') as HTMLButtonElement).click();
    await settled();
    expect(bad?.shadowRoot?.textContent).toBe('n 3');
    expect(light?.textContent).toBe('n 4');
    collected.stop();
    expect(collected.errors).toEqual([]); // not a failure: nothing renders an error view
    const [logged, other] = DEV ? [errors, warnings] : [warnings, errors];
    expect(other).not.toHaveBeenCalled();
    // Once per host: hydration isn't retried by the renders that follow.
    expect(logged).toHaveBeenCalledTimes(2);
    const reported = logged.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
    expect(reported).toMatch(
      /hydration mismatch in <test-mm-shadow>.*at a\[0\]: expected <button>, found <a>/,
    );
    expect(reported).toMatch(/hydration mismatch in <test-mm-light>.*found <i>/);
    if (DEV) {
      // The mismatch in full (template call site, explanation, code), then what was done.
      expect(reported).toMatch(/in <test-mm-shadow> \(template at [^)]+mismatch-hydration/);
      expect(reported).toMatch(
        /#mismatches\)\. \(G0062: https:\/\/gyral\.dev\/errors\/#G0062\) <test-mm-shadow> was rendered fresh after a hydration mismatch\. \(G0063: https:\/\/gyral\.dev\/errors\/#G0063\)/,
      );
    } else {
      // G0063 (production: the code, the tag and the docs URL), then the mismatch itself.
      expect(reported).toMatch(/Gyral G0063 test-mm-shadow https:\/\/gyral\.dev\/errors\/#G0063/);
      expect(reported).toMatch(/expected <button>, found <a>\. Gyral G0062 https:/);
    }
  });
});
