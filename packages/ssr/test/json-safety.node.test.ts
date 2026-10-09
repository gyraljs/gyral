import { afterEach, describe, expect, it } from 'vitest';
import { define, defineStore, html } from '@gyral/core';
import { page, renderToString } from '../src/index.js';

type Msg = { readonly _tag: 'Stamp' };

define<{ readonly at: Date | string }, Msg>()('ssr-dated', {
  init: () => ({ at: '2026-10-04' }),
  intent: {},
  update: { Stamp: () => ({ at: new Date(0) }) },
  view: (s) => html`<p>${String(s.at)}</p>`,
});

const clock = defineStore<{ readonly at: Date }, { readonly _tag: 'Noop' }>('ssr-clock', {
  init: () => ({ at: new Date(0) }),
  update: { Noop: (s) => s },
});

const warnings: string[] = [];
const original = console.warn;

afterEach(() => {
  console.warn = original;
  warnings.length = 0;
});

const capture = () => {
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };
};

describe('JSON safety of SSR seeds (gyral-4k7.5)', () => {
  it('warns with the path when a component seed is not JSON-safe', async () => {
    capture();
    await renderToString(html`<ssr-dated .initialMessages=${[{ _tag: 'Stamp' }]}></ssr-dated>`);
    expect(warnings).toEqual([
      '<ssr-dated>: seed.state.at is a Date (becomes a string), so the client would ' +
        'hydrate from different data than the server rendered. Keep seeded state and props ' +
        'JSON-safe (ADR 0012).',
    ]);
  });

  it('stays quiet for JSON-safe seeds', async () => {
    capture();
    await renderToString(html`<ssr-dated></ssr-dated>`);
    expect(warnings).toEqual([]);
  });

  it('warns for store states in the page seed', async () => {
    capture();
    const instance = clock.instance();
    await renderToString(page({ title: 't', body: html`<p>x</p>`, stores: [instance] }), {
      stores: [instance],
    });
    expect(warnings[0]).toContain('store "ssr-clock": state.at is a Date');
  });
});
