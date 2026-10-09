// A component that throws on the server (ADR 0024): it renders its error view (or an empty host
// marked data-gyral-error, without a seed), the page goes on, and onError hears the GyralError;
// onError: 'throw' fails renderPage before any byte is sent.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { define, GyralError, html } from '@gyral/core';
import { renderPage, renderToString } from '../src/index.js';

type Msg = { readonly _tag: 'X' };
const boom = (): never => {
  throw new Error('boom');
};
define<number, Msg>()('ssr-err-init', {
  intent: {},
  init: boom,
  update: { X: (s) => s },
  view: (s) => html`<p>${s}</p>`,
  error: (failure, state) => html`<p role="alert">${failure.phase} ${String(state)}</p>`,
});
define<number, Msg>()('ssr-err-view', {
  intent: {},
  init: () => 4,
  update: { X: (s) => s },
  view: boom,
  error: (failure, state) => html`<p role="alert">${failure.phase} ${String(state)}</p>`,
  shadow: false,
});
define<number, Msg>()('ssr-err-plain', {
  intent: {},
  init: () => 1,
  update: { X: (s) => s },
  view: boom,
});
define<number, Msg>()('ssr-err-twice', {
  intent: {},
  init: () => 1,
  update: { X: (s) => s },
  view: boom,
  error: boom,
});
define<number, Msg>()('ssr-err-fine', {
  intent: {},
  init: () => 2,
  update: { X: (s) => s },
  view: (s) => html`<p>fine ${s}</p>`,
});

const strip = (out: string): string => out.replace(/<!--[^>]*-->/g, '');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a component that throws on the server', () => {
  it('renders its error view, marked and without a seed; the rest of the page renders', async () => {
    const failures: GyralError[] = [];
    const out = strip(
      await renderToString(
        html`<ssr-err-init></ssr-err-init><ssr-err-view></ssr-err-view
          ><ssr-err-fine></ssr-err-fine>`,
        { onError: (e) => failures.push(e) },
      ),
    );
    expect(out).toContain(
      '<ssr-err-init data-gyral-error><template shadowrootmode="open"><p role="alert">init undefined</p></template></ssr-err-init>',
    );
    expect(out).toContain(
      '<ssr-err-view data-gyral-light data-gyral-error><p role="alert">view 4</p></ssr-err-view>',
    );
    expect(out).toMatch(/<ssr-err-fine data-gyral-seed='[^']*'>.*fine 2/);
    expect(out).not.toMatch(/<ssr-err-(init|view)[^>]*data-gyral-seed/);
    expect(failures.map((e) => [e.phase, e.component])).toEqual([
      ['init', 'ssr-err-init'],
      ['view', 'ssr-err-view'],
    ]);
    expect(failures[0]).toBeInstanceOf(GyralError);
    expect(String(failures[0]?.cause)).toMatch(/boom/);
  });

  it('without an error view, or when it throws too, leaves the host empty', async () => {
    const failures: GyralError[] = [];
    const out = strip(
      await renderToString(html`<ssr-err-plain></ssr-err-plain><ssr-err-twice></ssr-err-twice>`, {
        onError: (e) => failures.push(e),
      }),
    );
    expect(out).toBe(
      '<ssr-err-plain data-gyral-error><template shadowrootmode="open"></template></ssr-err-plain>' +
        '<ssr-err-twice data-gyral-error><template shadowrootmode="open"></template></ssr-err-twice>',
    );
    expect(failures).toHaveLength(2);
  });

  it('renderPage keeps its status and sends the whole page; onError defaults to console.error', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = renderPage({
      title: 't',
      body: html`<p>before</p>
        <ssr-err-plain></ssr-err-plain>
        <p>after</p>`,
    });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('<p>after</p>');
    expect(logged).toHaveBeenCalledOnce();
    expect(logged.mock.calls[0]?.[0]).toBeInstanceOf(GyralError);
  });

  it("onError: 'throw' fails renderPage before any byte is sent", () => {
    expect(() =>
      renderPage({ title: 't', body: html`<ssr-err-plain></ssr-err-plain>`, onError: 'throw' }),
    ).toThrow(GyralError);
    const ok = renderPage({
      title: 't',
      body: html`<ssr-err-fine></ssr-err-fine>`,
      onError: 'throw',
    });
    expect(ok.status).toBe(200);
  });
});
