// view/README.md "Conformance", property 2 (hydration is identity), with fast-check over the
// generated template results of property 1 (nested templates, keyed lists, arrays, single,
// multi and boolean attributes, text with merged-text cases, raw(), live form state, tables,
// shadow and light components with property props and slotted children):
// - hydrating server(A) with A changes nothing: every server node stays, in order, no
//   attribute is written, and the DOM is the one a client render of A builds (text node
//   boundaries included);
// - hydrating server(A), then rendering B, gives the DOM of client-rendering B directly, and
//   every node survives (or not) exactly as it does when the client rendered A first.
// Components hydrate on their own, before or after the parent's walk.
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { settled } from '../../src/index.js';
import { hydrate, render, type ChildValue } from '../../src/view/index.js';
import './conformance-components.js';
import { canon, cleanup, container, nodesOf, serverDom } from './hydrate-helpers.js';
import { watch } from './render-helpers.js';
import { view } from './server-arbitrary.js';

afterEach(cleanup);

const problems = (): string[] =>
  [...vi.mocked(console.error).mock.calls, ...vi.mocked(console.warn).mock.calls]
    .flat()
    .map(String)
    .filter((text) => /hydration mismatch/i.test(text));

/** Server DOM for `a`, hydrated; components first (their own flush) when `childFirst`. */
async function hydrated(a: ChildValue, dev: boolean, childFirst: boolean) {
  const root = serverDom(a, dev);
  if (childFirst) await settled();
  const before = nodesOf(root);
  const html = canon(root, true);
  const mutations = watch(root);
  hydrate(a, root);
  await settled();
  const attributes = mutations
    .take()
    .filter((m) => m.type === 'attributes' && m.attributeName !== 'data-gyral-seed');
  return { root, before, html, attributes };
}

async function client(value: ChildValue): Promise<HTMLDivElement> {
  const root = container();
  render(value, root);
  await settled();
  return root;
}

/** Each node of `now`, as its index in `then` (-1: created since). */
const lineage = (now: readonly Node[], then: readonly Node[]): number[] =>
  now.map((n) => then.indexOf(n));

describe('hydration is identity (view/README.md "Conformance", property 2)', () => {
  it('hydrating server(A) with A changes nothing and builds the client DOM of A', async () => {
    vi.spyOn(console, 'error');
    vi.spyOn(console, 'warn');
    await fc.assert(
      fc.asyncProperty(view, fc.boolean(), fc.boolean(), async (a, dev, childFirst) => {
        const { root, before, html, attributes } = await hydrated(a, dev, childFirst);
        expect(problems()).toEqual([]);
        expect(attributes).toEqual([]);
        expect(canon(root, true)).toBe(html);
        const after = nodesOf(root);
        expect(after.filter((n) => before.includes(n))).toEqual(before);
        expect(canon(root)).toBe(canon(await client(a)));
        cleanup();
      }),
      { numRuns: 120 },
    );
  });

  it('hydrating server(A), then rendering B, equals client-rendering B; nodes kept alike', async () => {
    vi.spyOn(console, 'error');
    vi.spyOn(console, 'warn');
    await fc.assert(
      fc.asyncProperty(view, view, fc.boolean(), fc.boolean(), async (a, b, dev, childFirst) => {
        const { root } = await hydrated(a, dev, childFirst);
        expect(problems()).toEqual([]);
        const ref = await client(a);
        const hydratedNodes = nodesOf(root);
        const refNodes = nodesOf(ref);
        render(b, root);
        render(b, ref);
        await settled();
        expect(canon(root, false, true)).toBe(canon(await client(b), false, true));
        expect(lineage(nodesOf(root), hydratedNodes)).toEqual(lineage(nodesOf(ref), refNodes));
        cleanup();
      }),
      { numRuns: 150 },
    );
  });

  it('keeps nodes across a re-render of the same shape (refilled values)', async () => {
    // B differs from A only in leaves: the instances stay, so do their static nodes.
    await fc.assert(
      fc.asyncProperty(view, fc.boolean(), async (a, dev) => {
        const { root, before } = await hydrated(a, dev, false);
        render(a, root);
        await settled();
        expect(nodesOf(root).filter((n) => before.includes(n))).toEqual(before);
        cleanup();
      }),
      { numRuns: 60 },
    );
  });
});
