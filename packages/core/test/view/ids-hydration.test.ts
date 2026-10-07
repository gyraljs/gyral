// view/07-hydration.md with template objects as a production client build carries them (no
// id, view/01-templates.md "Template ids"): hydration is structural, development markers are
// consumed without an id check, and after hydration the same object patches while another
// replaces. A client whose objects have ids (development) still checks markers. Runs against
// development and production builds of core (the browser and browser-prod projects).
import { afterEach, describe, expect, it } from 'vitest';
import { renderToString } from '../../src/server.js';
import {
  compiled,
  DEV,
  each,
  hydrate,
  normalize,
  render,
  type ChildValue,
  type TemplateObject,
} from '../../src/view/index.js';
import { clientObject } from './helpers.js';
import { canon, cleanup, container, nodesOf, serverDom } from './hydrate-helpers.js';

afterEach(cleanup);

/** One template as the server has it (id, segments) and as a production client has it. */
function pair(strings: readonly string[]): { server: TemplateObject; client: TemplateObject } {
  const server = normalize(strings);
  return { server, client: clientObject(server, true) };
}

const list = pair(['<ul class="l">', '</ul><p>Total: ', '</p>']);
const row = pair(['<li>', ' <b>', '</b></li>']);

/** The view with the server's or the client's objects (the row's object comes from `pick`). */
function view(side: 'server' | 'client', items: readonly string[]): ChildValue {
  return compiled(list[side], [
    each(
      items,
      (x) => x,
      (x, template) => compiled(template, [x, x.length]),
      () => row[side],
    ),
    items.length,
  ]);
}

function fresh(value: ChildValue): HTMLDivElement {
  const el = container();
  render(value, el);
  return el;
}

const elements = (nodes: readonly Node[]): Node[] => nodes.filter((n) => n.nodeType !== 3);

describe('hydrating with templates without ids', () => {
  it('adopts production and development output, keeping every server node', () => {
    for (const dev of [false, true]) {
      const root = serverDom(view('server', ['ab', 'c']), dev);
      expect(root.innerHTML.includes('<!--gyral:')).toBe(dev);
      const before = nodesOf(root);
      hydrate(view('client', ['ab', 'c']), root);
      expect(root.innerHTML).not.toContain('<!--gyral:');
      expect(elements(nodesOf(root))).toEqual(elements(before));
      expect(canon(root)).toBe(canon(fresh(view('client', ['ab', 'c']))));
      // Updates patch the adopted instances: same objects, same nodes.
      const ul = root.querySelector('ul');
      const lis = [...root.querySelectorAll('li')];
      render(view('client', ['c', 'ab', 'xyz']), root);
      expect(canon(root)).toBe(canon(fresh(view('client', ['c', 'ab', 'xyz']))));
      expect(root.querySelector('ul')).toBe(ul);
      expect([...root.querySelectorAll('li')].slice(0, 2)).toEqual([lis[1], lis[0]]);
    }
  });

  it("doesn't check a development marker without an id: hydration stays structural", () => {
    const other = renderToString(compiled(normalize(['<i>', '</i>']), ['x']), { dev: true });
    const marker = other.replace(/<i>.*/, '');
    const root = container();
    root.setHTMLUnsafe(marker + renderToString(view('server', ['a']), { dev: false }));
    expect(() => {
      hydrate(view('client', ['a']), root);
    }).not.toThrow();
    expect(root.innerHTML).not.toContain('<!--gyral:');
  });

  it('replaces an adopted instance when another object renders in its place', () => {
    const card = pair(['<p class="card">', '</p>']);
    const twin = clientObject(normalize(['<p class="card">', '</p>']), true);
    const outer = pair(['<div>', '</div>']);
    const root = serverDom(compiled(outer.server, [compiled(card.server, ['a'])]));
    hydrate(compiled(outer.client, [compiled(card.client, ['a'])]), root);
    const p = root.querySelector('p');
    render(compiled(outer.client, [compiled(card.client, ['b'])]), root);
    expect(root.querySelector('p')).toBe(p);
    render(compiled(outer.client, [compiled(twin, ['c'])]), root);
    expect(p?.isConnected).toBe(false);
    expect(root.querySelector('p')?.textContent).toBe('c');
  });
});

describe('hydrating with templates with ids (development builds, the runtime path)', () => {
  it('adopts development output; development checks each marker against the id', () => {
    const root = serverDom(view('server', ['a', 'bc']), true);
    const before = nodesOf(root);
    const withIds = (items: readonly string[]): ChildValue =>
      compiled(clientObject(list.server), [
        each(
          items,
          (x) => x,
          (x) => compiled(clientObject(row.server), [x, x.length]),
        ),
        items.length,
      ]);
    hydrate(withIds(['a', 'bc']), root);
    expect(elements(nodesOf(root))).toEqual(elements(before));
    expect(canon(root)).toBe(canon(fresh(withIds(['a', 'bc']))));

    const wrong = container();
    const other = renderToString(compiled(normalize(['<i>', '</i>']), ['x']), { dev: true });
    wrong.setHTMLUnsafe(
      other.replace(/<i>.*/, '') + renderToString(view('server', ['a']), { dev: false }),
    );
    const attempt = (): void => {
      hydrate(withIds(['a']), wrong);
    };
    if (DEV) expect(attempt).toThrow(/expected <!--gyral:\w+-->/);
    else expect(attempt).not.toThrow();
  });
});
