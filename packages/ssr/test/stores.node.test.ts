import { describe, expect, it } from 'vitest';
import { define, defineStore, html, type GyralError } from '@gyral/core';
import { renderToString as renderWithoutScope } from '@gyral/core/server';
import { page, renderPage, renderToStream, renderToString } from '../src/index.js';

interface Cart {
  readonly owner: string;
  readonly lines: readonly string[];
}
const cart = defineStore<Cart, { readonly _tag: 'Add'; readonly sku: string }>('ssr-cart', {
  init: () => ({ owner: 'nobody', lines: [] }),
  update: { Add: (s, m) => ({ ...s, lines: [...s.lines, m.sku] }) },
});

define<{ readonly x: number }, never>()('ssr-badge', {
  stores: [cart],
  init: () => ({ x: 0 }),
  intent: {},
  update: {},
  view: (_s, _i, { read }) => html`<p>${read(cart).owner}:${read(cart).lines.length}</p>`,
});

// Many store-reading components, so one render spans many iteration steps.
const many = html`${Array.from({ length: 20 }, () => html`<ssr-badge></ssr-badge>`)}`;

const owners = (out: string): string[] =>
  [...out.matchAll(/<p>(?:<!--[^>]*-->)*([a-z]+)(?:<!--[^>]*-->)*:/g)].map((m) => m[1] ?? '');

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

describe('stores on the server (ADR 0013)', () => {
  it('lets components read the request store synchronously during the render', async () => {
    const out = await renderToString(html`<ssr-badge></ssr-badge>`, {
      stores: [cart.instance({ owner: 'ada', lines: ['a', 'b'] })],
    });
    expect(out).toMatch(/<p>(<!--[^>]*-->)*ada(<!--[^>]*-->)*:(<!--[^>]*-->)*2/);
  });

  it('starts unlisted stores from init', async () => {
    const out = await renderToString(html`<ssr-badge></ssr-badge>`, { stores: [] });
    expect(owners(out)).toEqual(['nobody']);
  });

  it('fails clearly when a component reads a store outside any render scope', () => {
    // The component fails alone (ADR 0024): reported through onError, the page goes on.
    const failures: GyralError[] = [];
    const out = renderWithoutScope(html`<ssr-badge></ssr-badge>`, {
      onError: (e) => failures.push(e as GyralError),
    });
    expect(out).toContain('data-gyral-error');
    expect(String(failures[0]?.cause)).toMatch(/without a store scope/);
  });

  it('renders a component per pull, so each step can run in its own scope', async () => {
    const reader = renderToStream(many, { stores: [] }).getReader();
    let chunks = 0;
    for (let next = await reader.read(); !next.done; next = await reader.read()) chunks++;
    expect(chunks).toBeGreaterThanOrEqual(20); // at least one chunk per component boundary
  });

  it('writes one script-safe page seed with every store state', async () => {
    const instance = cart.instance({ owner: '</script><script>x', lines: ['a'] });
    const out = await renderToString(
      page({ title: 't', body: html`<ssr-badge></ssr-badge>`, stores: [instance] }),
      { stores: [instance] },
    );
    const match = /<script type="application\/json" data-gyral-stores>([^<]*)<\/script>/.exec(out);
    expect(match?.[1]).toBeDefined();
    expect(out).not.toContain('</script><script>x');
    expect(JSON.parse(match?.[1] ?? 'null')).toEqual({
      'ssr-cart': { owner: '</script><script>x', lines: ['a'] },
    });
  });

  it('isolates interleaved streamed renders of different requests', async () => {
    const readerA = renderToStream(many, {
      stores: [cart.instance({ owner: 'ann', lines: [] })],
    }).getReader();
    const readerB = renderToStream(many, {
      stores: [cart.instance({ owner: 'bob', lines: [] })],
    }).getReader();
    const decoder = new TextDecoder();
    let a = '';
    let b = '';
    let doneA = false;
    let doneB = false;
    // Alternate chunk by chunk, so both renders are in progress at the same time.
    while (!doneA || !doneB) {
      if (!doneA) {
        const next = await readerA.read();
        doneA = next.done;
        if (next.value !== undefined) a += decoder.decode(next.value);
      }
      if (!doneB) {
        const next = await readerB.read();
        doneB = next.done;
        if (next.value !== undefined) b += decoder.decode(next.value);
      }
    }
    expect(owners(a)).toEqual(Array.from({ length: 20 }, () => 'ann'));
    expect(owners(b)).toEqual(Array.from({ length: 20 }, () => 'bob'));
  });

  it('isolates concurrent full-page responses', async () => {
    const pages = ['cy', 'di', 'ed'].map((owner) => {
      const store = cart.instance({ owner, lines: [] });
      return readAll(
        renderPage({ title: owner, body: many, stores: [store] }).body ?? new ReadableStream(),
      );
    });
    const outs = await Promise.all(pages);
    expect(outs.map((out) => new Set(owners(out)))).toEqual([
      new Set(['cy']),
      new Set(['di']),
      new Set(['ed']),
    ]);
  });
});
